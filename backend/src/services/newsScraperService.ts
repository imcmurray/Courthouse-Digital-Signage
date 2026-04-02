import { PrismaClient } from '@prisma/client';
import https from 'https';
import http from 'http';
import * as cheerio from 'cheerio';
import type { Server } from 'socket.io';

const prisma = new PrismaClient();

const DEFAULT_COURT_URL = 'https://www.utb.uscourts.gov';

interface ScrapeResult {
  articlesFound: number;
  articlesCreated: number;
  articlesUpdated: number;
  articlesPruned: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Fetch a URL and return the response body as a string.
 * 15-second timeout, follows redirects, graceful error handling.
 */
function fetchUrl(url: string, redirectCount = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return reject(new Error(`Unsupported protocol: ${parsed.protocol}`));
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      timeout: 15000,
      headers: {
        'User-Agent': 'CourthouseDigitalSignage/1.0',
        'Cache-Control': 'no-cache',
      },
    };

    const req = client.get(options, (res) => {
      // Follow redirects (max 5)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectCount >= 5) {
          return reject(new Error(`Too many redirects (max 5) fetching ${url}`));
        }
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        fetchUrl(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

/**
 * Parse news items from the court website HTML using cheerio.
 * Looks for common Drupal news patterns used on uscourts.gov sites.
 */
function parseNewsItems(html: string, baseUrl: string): { title: string; summary: string; url: string; publishedAt: Date | null }[] {
  const $ = cheerio.load(html);
  const items: { title: string; summary: string; url: string; publishedAt: Date | null }[] = [];
  const seen = new Set<string>();

  function resolveUrl(href: string): string {
    return href.startsWith('http') ? href : new URL(href, baseUrl).href;
  }

  function truncate(text: string, max: number): string {
    return text.length > max ? text.substring(0, max - 3) + '...' : text;
  }

  function extractDate(el: ReturnType<typeof $>): Date | null {
    const timeEl = el.find('time, span[class*="date"]').first();
    const dateStr = timeEl.attr('datetime') || timeEl.text().trim();
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
  }

  // Pattern 1: Drupal views-row items
  $('[class*="views-row"]').each((_i, el) => {
    if (items.length >= 15) return false;
    const row = $(el);
    const link = row.find('a').first();
    const href = link.attr('href');
    if (!href) return;

    const title = link.text().trim();
    if (!title || title.length < 5) return;

    const fullUrl = resolveUrl(href);
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    // Extract summary from field-content div or remaining text
    let summary = row.find('[class*="field-content"]').first().text().trim();
    if (!summary) {
      summary = row.text().replace(title, '').trim();
    }
    summary = truncate(summary, 200) || title;

    items.push({ title, summary, url: fullUrl, publishedAt: extractDate(row) });
  });

  // Pattern 2: Fallback to <article> or <li> elements
  if (items.length === 0) {
    $('article, li').each((_, el) => {
      if (items.length >= 15) return false;
      const block = $(el);
      const link = block.find('a').first();
      const href = link.attr('href');
      if (!href) return;

      const title = link.text().trim();
      if (!title || title.length < 10) return;

      // Skip navigation/footer links
      if (href.includes('#') && !href.includes('/node/') && !href.includes('/news')) return;

      const fullUrl = resolveUrl(href);
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      let summary = block.text().trim();
      summary = truncate(summary, 200) || title;

      items.push({ title, summary, url: fullUrl, publishedAt: null });
    });
  }

  return items.slice(0, 15);
}

/**
 * Run a news scrape: fetch court website, parse news, upsert into DB, prune old articles.
 */
export async function runNewsScrape(io?: Server): Promise<ScrapeResult> {
  try {
    // Get court website URL from settings
    const urlSetting = await prisma.setting.findUnique({
      where: { key: 'court_website_url' },
    });
    const courtUrl = urlSetting?.value
      ? JSON.parse(urlSetting.value)
      : DEFAULT_COURT_URL;

    console.log(`[News Scraper] Scraping news from ${courtUrl}`);

    const html = await fetchUrl(courtUrl);
    const newsItems = parseNewsItems(html, courtUrl);

    console.log(`[News Scraper] Found ${newsItems.length} news items`);

    let created = 0;
    let updated = 0;

    for (const item of newsItems) {
      try {
        const existing = await prisma.cachedNewsArticle.findUnique({
          where: { url: item.url },
        });

        if (existing) {
          // Update if title or summary changed
          if (existing.title !== item.title || existing.summary !== item.summary) {
            await prisma.cachedNewsArticle.update({
              where: { id: existing.id },
              data: {
                title: item.title,
                summary: item.summary,
                publishedAt: item.publishedAt,
                fetchedAt: new Date(),
              },
            });
            updated++;
          }
        } else {
          await prisma.cachedNewsArticle.create({
            data: {
              title: item.title,
              summary: item.summary,
              url: item.url,
              publishedAt: item.publishedAt,
              fetchedAt: new Date(),
            },
          });
          created++;
        }
      } catch (err: any) {
        // P2002 = unique constraint (race condition)
        if (err.code === 'P2002') continue;
        console.error(`[News Scraper] Error upserting article: ${item.title}`, err.message);
      }
    }

    // Prune articles older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const pruned = await prisma.cachedNewsArticle.deleteMany({
      where: { fetchedAt: { lt: thirtyDaysAgo } },
    });

    const result: ScrapeResult = {
      articlesFound: newsItems.length,
      articlesCreated: created,
      articlesUpdated: updated,
      articlesPruned: pruned.count,
      status: 'success',
    };

    console.log(`[News Scraper] Complete: ${created} created, ${updated} updated, ${pruned.count} pruned`);

    // Emit WebSocket event
    if (io) {
      io.emit('idle-content:update', {});
    }

    return result;
  } catch (err: any) {
    const errorMessage = err.message || 'Unknown error';
    console.error('[News Scraper] Scrape failed:', errorMessage);
    return {
      articlesFound: 0,
      articlesCreated: 0,
      articlesUpdated: 0,
      articlesPruned: 0,
      status: 'failed',
      errorMessage,
    };
  }
}

/**
 * Start the news scraper polling timer.
 */
export function startNewsPolling(intervalMinutes: number, io?: Server) {
  stopNewsPolling();
  console.log(`[News Scraper] Auto-scrape started (every ${intervalMinutes} minutes)`);
  pollingTimer = setInterval(async () => {
    try {
      await runNewsScrape(io);
    } catch (err) {
      console.error('[News Scraper] Auto-scrape error:', err);
    }
  }, intervalMinutes * 60 * 1000);
}

/**
 * Stop the news scraper polling timer.
 */
export function stopNewsPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    console.log('[News Scraper] Auto-scrape stopped');
  }
}

/**
 * Sync the polling timer with current settings.
 */
export async function syncNewsPollingTimer(io?: Server) {
  const [enabledSetting, intervalSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'news_scrape_enabled' } }),
    prisma.setting.findUnique({ where: { key: 'news_scrape_interval' } }),
  ]);

  const enabled = enabledSetting?.value ? JSON.parse(enabledSetting.value) === true : false;
  const intervalMinutes = intervalSetting?.value ? parseInt(JSON.parse(intervalSetting.value), 10) : 60;

  if (enabled) {
    startNewsPolling(intervalMinutes, io);
  } else {
    stopNewsPolling();
  }
}
