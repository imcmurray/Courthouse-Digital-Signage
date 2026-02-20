import { PrismaClient } from '@prisma/client';
import https from 'https';
import http from 'http';

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
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
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
      // Follow redirects (up to 3)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        fetchUrl(redirectUrl).then(resolve).catch(reject);
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
 * Parse news items from the court website HTML.
 * Looks for common Drupal news patterns used on uscourts.gov sites.
 */
function parseNewsItems(html: string, baseUrl: string): { title: string; summary: string; url: string; publishedAt: Date | null }[] {
  const items: { title: string; summary: string; url: string; publishedAt: Date | null }[] = [];
  const seen = new Set<string>();

  // Pattern 1: Drupal views-row items with links and text
  // Match <div class="views-row">...</div> blocks
  const viewsRowPattern = /<div[^>]*class="[^"]*views-row[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*views-row|<\/div>\s*<\/div>)/gi;
  let match;

  while ((match = viewsRowPattern.exec(html)) !== null) {
    const block = match[1];

    // Extract link and title
    const linkMatch = block.match(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const href = linkMatch[1];
    const title = linkMatch[2].replace(/<[^>]+>/g, '').trim();
    if (!title || title.length < 5) continue;

    const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);

    // Extract summary text (look for field-content or plain text after link)
    let summary = '';
    const summaryMatch = block.match(/<div[^>]*class="[^"]*field-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (summaryMatch) {
      summary = summaryMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    if (!summary) {
      // Fallback: grab any text content after the link
      const textAfterLink = block.substring((linkMatch.index || 0) + linkMatch[0].length);
      summary = textAfterLink.replace(/<[^>]+>/g, '').trim();
    }
    // Truncate summary to ~200 chars
    if (summary.length > 200) {
      summary = summary.substring(0, 197) + '...';
    }
    if (!summary) summary = title;

    // Extract date if present
    let publishedAt: Date | null = null;
    const dateMatch = block.match(/<(?:time|span)[^>]*(?:datetime="([^"]*)"[^>]*|class="[^"]*date[^"]*"[^>]*)>([\s\S]*?)<\/(?:time|span)>/i);
    if (dateMatch) {
      const dateStr = dateMatch[1] || dateMatch[2]?.replace(/<[^>]+>/g, '').trim();
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) publishedAt = parsed;
      }
    }

    items.push({ title, summary, url: fullUrl, publishedAt });
  }

  // Pattern 2: If no views-rows found, try <article> or <li> with news links
  if (items.length === 0) {
    const articlePattern = /<(?:article|li)[^>]*>([\s\S]*?)<\/(?:article|li)>/gi;
    while ((match = articlePattern.exec(html)) !== null) {
      const block = match[1];
      const linkMatch = block.match(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;

      const href = linkMatch[1];
      const title = linkMatch[2].replace(/<[^>]+>/g, '').trim();
      if (!title || title.length < 10) continue;

      // Skip navigation/footer links
      if (href.includes('#') && !href.includes('/node/') && !href.includes('/news')) continue;

      const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
      if (seen.has(fullUrl)) continue;
      seen.add(fullUrl);

      let summary = block.replace(/<[^>]+>/g, '').trim();
      if (summary.length > 200) summary = summary.substring(0, 197) + '...';
      if (!summary) summary = title;

      items.push({ title, summary, url: fullUrl, publishedAt: null });

      if (items.length >= 15) break;
    }
  }

  return items.slice(0, 15);
}

/**
 * Run a news scrape: fetch court website, parse news, upsert into DB, prune old articles.
 */
export async function runNewsScrape(io?: any): Promise<ScrapeResult> {
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
export function startNewsPolling(intervalMinutes: number, io?: any) {
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
export async function syncNewsPollingTimer(io?: any) {
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
