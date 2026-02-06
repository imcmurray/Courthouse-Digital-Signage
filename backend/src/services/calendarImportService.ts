import { PrismaClient } from '@prisma/client';
import https from 'https';
import http from 'http';
import { parseCalendar, extractJudgeCode, getJudgeName, ParsedEntry } from './pdfParser';

const prisma = new PrismaClient();

// Known judge page paths on the court website
const JUDGE_PAGES = [
  '/content/public-calendar-judge-peggy-hunt',
  '/content/public-calendar-judge-cathleen-d-parker',
  '/content/public-calendar-judge-michael-f-thomson',
  '/content/public-calendar-judge-william-t-thurman',
  '/content/public-calendar-judge-kevin-r-anderson',
  '/content/public-calendar-judge-joel-t-marker',
];

const DEFAULT_SOURCE_URL = 'https://www.utb.uscourts.gov';

interface ImportResult {
  judgeName: string;
  judgeCode: string;
  filename: string;
  entriesFound: number;
  entriesCreated: number;
  entriesUpdated: number;
  entriesSkipped: number;
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
  durationMs: number;
}

interface ImportStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  autoImportEnabled: boolean;
  intervalMinutes: number;
}

let isImportRunning = false;
let lastRunAt: string | null = null;
let lastRunStatus: string | null = null;
let pollingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Fetch a URL and return the response body as a string or Buffer.
 */
function fetchUrl(url: string, binary = false): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 30000 }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        fetchUrl(redirectUrl, binary).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

/**
 * Scrape a judge's individual page to find the PDF link.
 * Returns the full PDF URL or null if not found.
 */
async function scrapePdfLink(baseUrl: string, pagePath: string): Promise<string | null> {
  const pageUrl = `${baseUrl}${pagePath}`;
  try {
    const html = (await fetchUrl(pageUrl)).toString('utf-8');
    // Look for PDF links in anticipated_calendars directory
    const pdfPattern = /href="([^"]*\/sites\/utb\/files\/anticipated_calendars\/[^"]*\.pdf)"/gi;
    const match = pdfPattern.exec(html);
    if (match) {
      const href = match[1];
      return href.startsWith('http') ? href : `${baseUrl}${href}`;
    }
    return null;
  } catch (err) {
    console.error(`Failed to scrape ${pageUrl}:`, err);
    return null;
  }
}

/**
 * Discover all PDF links by scraping each judge's page.
 */
async function discoverPdfLinks(baseUrl: string): Promise<{ url: string; filename: string }[]> {
  const links: { url: string; filename: string }[] = [];

  for (const pagePath of JUDGE_PAGES) {
    const pdfUrl = await scrapePdfLink(baseUrl, pagePath);
    if (pdfUrl) {
      const filename = pdfUrl.split('/').pop() || '';
      links.push({ url: pdfUrl, filename });
    }
  }

  return links;
}

/**
 * Upsert a single parsed entry into the DocketEntry table.
 * Returns 'created', 'updated', or 'skipped'.
 */
async function upsertEntry(entry: ParsedEntry, judgeName: string): Promise<'created' | 'updated' | 'skipped'> {
  const hearingDate = new Date(entry.hearingDate + 'T00:00:00.000Z');

  try {
    const existing = await prisma.docketEntry.findUnique({
      where: {
        caseNumber_hearingDate_hearingTime: {
          caseNumber: entry.caseNumber,
          hearingDate,
          hearingTime: entry.hearingTime,
        },
      },
    });

    const data = {
      caseTitle: entry.caseTitle,
      caseChapter: entry.caseChapter,
      adversaryNumber: entry.adversaryNumber,
      adversaryTitle: entry.adversaryTitle,
      hearingMatter: entry.hearingMatter,
      hearingJudge: judgeName,
      courtroom: entry.courtroom,
      movingParty: entry.movingParty,
      opposingParty: entry.opposingParty,
      trustee: entry.trustee,
      isZoom: entry.isZoom,
      zoomMeetingId: entry.zoomMeetingId,
      zoomPasscode: entry.zoomPasscode,
      zoomPhone: entry.zoomPhone,
      status: entry.status,
      comment: entry.comment,
    };

    if (existing) {
      await prisma.docketEntry.update({
        where: { id: existing.id },
        data,
      });
      return 'updated';
    } else {
      await prisma.docketEntry.create({
        data: {
          caseNumber: entry.caseNumber,
          hearingDate,
          hearingTime: entry.hearingTime,
          ...data,
        },
      });
      return 'created';
    }
  } catch (err: any) {
    // P2002 = unique constraint violation (race condition)
    if (err.code === 'P2002') return 'skipped';
    throw err;
  }
}

/**
 * Run a full import cycle: scrape, download, parse, upsert.
 */
export async function runImport(io?: any): Promise<ImportResult[]> {
  if (isImportRunning) {
    throw new Error('Import is already running');
  }

  isImportRunning = true;
  const results: ImportResult[] = [];

  try {
    // Get source URL from settings, falling back to default
    const sourceUrlSetting = await prisma.setting.findUnique({
      where: { key: 'calendar_import_source_url' },
    });
    const baseUrl = sourceUrlSetting?.value
      ? JSON.parse(sourceUrlSetting.value)
      : DEFAULT_SOURCE_URL;

    console.log(`[Calendar Import] Starting import from ${baseUrl}`);

    // Discover PDF links
    const pdfLinks = await discoverPdfLinks(baseUrl);
    console.log(`[Calendar Import] Found ${pdfLinks.length} PDF calendars`);

    if (pdfLinks.length === 0) {
      const log = await prisma.importLog.create({
        data: {
          source: 'pdf-auto',
          status: 'failed',
          errorMessage: 'No PDF calendars found on court website',
        },
      });
      results.push({
        judgeName: '',
        judgeCode: '',
        filename: '',
        entriesFound: 0,
        entriesCreated: 0,
        entriesUpdated: 0,
        entriesSkipped: 0,
        status: 'failed',
        errorMessage: 'No PDF calendars found',
        durationMs: 0,
      });
      isImportRunning = false;
      lastRunAt = new Date().toISOString();
      lastRunStatus = 'failed';
      return results;
    }

    // Process each PDF
    for (const { url, filename } of pdfLinks) {
      const startMs = Date.now();
      const judgeCode = extractJudgeCode(filename);
      const judgeName = getJudgeName(judgeCode);

      const logEntry = await prisma.importLog.create({
        data: {
          source: 'pdf-auto',
          judgeName,
          judgeCode,
          sourceUrl: url,
          filename,
          status: 'running',
        },
      });

      try {
        console.log(`[Calendar Import] Downloading ${filename}...`);
        const pdfBuffer = await fetchUrl(url, true);

        console.log(`[Calendar Import] Parsing ${filename} (${pdfBuffer.length} bytes)...`);
        const calendar = await parseCalendar(pdfBuffer, filename);

        console.log(`[Calendar Import] Found ${calendar.entries.length} entries for ${judgeName}`);

        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (const entry of calendar.entries) {
          const result = await upsertEntry(entry, judgeName);
          if (result === 'created') created++;
          else if (result === 'updated') updated++;
          else skipped++;
        }

        const durationMs = Date.now() - startMs;

        await prisma.importLog.update({
          where: { id: logEntry.id },
          data: {
            entriesFound: calendar.entries.length,
            entriesCreated: created,
            entriesUpdated: updated,
            entriesSkipped: skipped,
            status: 'success',
            durationMs,
          },
        });

        results.push({
          judgeName,
          judgeCode,
          filename,
          entriesFound: calendar.entries.length,
          entriesCreated: created,
          entriesUpdated: updated,
          entriesSkipped: skipped,
          status: 'success',
          durationMs,
        });

        console.log(`[Calendar Import] ${judgeName}: ${created} created, ${updated} updated, ${skipped} skipped (${durationMs}ms)`);
      } catch (err: any) {
        const durationMs = Date.now() - startMs;
        const errorMessage = err.message || 'Unknown error';

        await prisma.importLog.update({
          where: { id: logEntry.id },
          data: {
            status: 'failed',
            errorMessage,
            durationMs,
          },
        });

        results.push({
          judgeName,
          judgeCode,
          filename,
          entriesFound: 0,
          entriesCreated: 0,
          entriesUpdated: 0,
          entriesSkipped: 0,
          status: 'failed',
          errorMessage,
          durationMs,
        });

        console.error(`[Calendar Import] Failed for ${judgeName}:`, errorMessage);
      }
    }

    // Emit socket event if io is available
    if (io) {
      io.emit('docket:update');
    }

    lastRunAt = new Date().toISOString();
    lastRunStatus = results.every(r => r.status === 'success') ? 'success' :
                    results.some(r => r.status === 'success') ? 'partial' : 'failed';

    console.log(`[Calendar Import] Import complete: ${results.length} calendars processed`);
  } catch (err: any) {
    console.error('[Calendar Import] Import failed:', err);
    lastRunAt = new Date().toISOString();
    lastRunStatus = 'failed';
  } finally {
    isImportRunning = false;
  }

  return results;
}

/**
 * Get current import status.
 */
export async function getImportStatus(): Promise<ImportStatus> {
  const enabledSetting = await prisma.setting.findUnique({
    where: { key: 'calendar_import_enabled' },
  });
  const intervalSetting = await prisma.setting.findUnique({
    where: { key: 'calendar_import_interval' },
  });

  return {
    isRunning: isImportRunning,
    lastRunAt,
    lastRunStatus,
    autoImportEnabled: enabledSetting?.value ? JSON.parse(enabledSetting.value) === true : false,
    intervalMinutes: intervalSetting?.value ? parseInt(JSON.parse(intervalSetting.value), 10) : 30,
  };
}

/**
 * Get import configuration.
 */
export async function getImportConfig(): Promise<{
  enabled: boolean;
  intervalMinutes: number;
  sourceUrl: string;
}> {
  const [enabledSetting, intervalSetting, sourceUrlSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'calendar_import_enabled' } }),
    prisma.setting.findUnique({ where: { key: 'calendar_import_interval' } }),
    prisma.setting.findUnique({ where: { key: 'calendar_import_source_url' } }),
  ]);

  return {
    enabled: enabledSetting?.value ? JSON.parse(enabledSetting.value) === true : false,
    intervalMinutes: intervalSetting?.value ? parseInt(JSON.parse(intervalSetting.value), 10) : 30,
    sourceUrl: sourceUrlSetting?.value ? JSON.parse(sourceUrlSetting.value) : DEFAULT_SOURCE_URL,
  };
}

/**
 * Update import configuration.
 */
export async function updateImportConfig(
  config: { enabled?: boolean; intervalMinutes?: number; sourceUrl?: string },
  userId?: string
): Promise<void> {
  const updates: Promise<any>[] = [];

  if (config.enabled !== undefined) {
    updates.push(prisma.setting.upsert({
      where: { key: 'calendar_import_enabled' },
      create: { key: 'calendar_import_enabled', value: JSON.stringify(config.enabled), updatedById: userId },
      update: { value: JSON.stringify(config.enabled), updatedById: userId },
    }));
  }

  if (config.intervalMinutes !== undefined) {
    updates.push(prisma.setting.upsert({
      where: { key: 'calendar_import_interval' },
      create: { key: 'calendar_import_interval', value: JSON.stringify(config.intervalMinutes), updatedById: userId },
      update: { value: JSON.stringify(config.intervalMinutes), updatedById: userId },
    }));
  }

  if (config.sourceUrl !== undefined) {
    updates.push(prisma.setting.upsert({
      where: { key: 'calendar_import_source_url' },
      create: { key: 'calendar_import_source_url', value: JSON.stringify(config.sourceUrl), updatedById: userId },
      update: { value: JSON.stringify(config.sourceUrl), updatedById: userId },
    }));
  }

  await Promise.all(updates);

  // Restart polling timer if enabled/interval changed
  if (config.enabled !== undefined || config.intervalMinutes !== undefined) {
    await syncPollingTimer();
  }
}

/**
 * Get import history (paginated).
 */
export async function getImportHistory(page = 1, limit = 20): Promise<{
  logs: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    prisma.importLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.importLog.count(),
  ]);

  return {
    logs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get a single import log by ID.
 */
export async function getImportLogById(id: string) {
  return prisma.importLog.findUnique({ where: { id } });
}

/**
 * Start the auto-import polling timer.
 */
export function startPolling(intervalMinutes: number, io?: any) {
  stopPolling();
  console.log(`[Calendar Import] Auto-import started (every ${intervalMinutes} minutes)`);
  pollingTimer = setInterval(async () => {
    try {
      await runImport(io);
    } catch (err) {
      console.error('[Calendar Import] Auto-import error:', err);
    }
  }, intervalMinutes * 60 * 1000);
}

/**
 * Stop the auto-import polling timer.
 */
export function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    console.log('[Calendar Import] Auto-import stopped');
  }
}

/**
 * Sync the polling timer with current settings.
 */
export async function syncPollingTimer(io?: any) {
  const config = await getImportConfig();
  if (config.enabled) {
    startPolling(config.intervalMinutes, io);
  } else {
    stopPolling();
  }
}
