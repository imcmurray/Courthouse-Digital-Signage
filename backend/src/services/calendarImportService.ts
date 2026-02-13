import { PrismaClient } from '@prisma/client';
import https from 'https';
import http from 'http';
import { parseCalendar, extractJudgeCode, getJudgeName, ParsedEntry } from './pdfParser';

const prisma = new PrismaClient();

const DEFAULT_SOURCE_URL = 'https://www.utb.uscourts.gov/anticipated-pdf/all';

interface ImportResult {
  judgeName: string;
  judgeCode: string;
  filename: string;
  entriesFound: number;
  entriesCreated: number;
  entriesUpdated: number;
  entriesSkipped: number;
  entriesRemoved: number;
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
  durationMs: number;
}

interface ImportProgress {
  currentJudge: string | null;
  currentStep: string | null;
  completedCalendars: number;
  totalCalendars: number;
  lastError: string | null;
}

interface ImportStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  autoImportEnabled: boolean;
  intervalMinutes: number;
  progress: ImportProgress | null;
}

let isImportRunning = false;
let lastRunAt: string | null = null;
let lastRunStatus: string | null = null;
let importProgress: ImportProgress | null = null;
let pollingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Fetch a URL and return the response body as a string or Buffer.
 * Sends cache-busting headers so proxies/CDNs return fresh content.
 */
function fetchUrl(url: string, binary = false): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      timeout: 30000,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    };
    const req = client.get(options, (res) => {
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
 * Discover all PDF links by scraping the aggregated calendar page.
 * Matches PDF URLs from both href and iframe src attributes, deduplicating by URL.
 * Appends a cache-busting parameter to ensure we always get the latest page.
 */
async function discoverPdfLinks(sourceUrl: string): Promise<{ url: string; filename: string }[]> {
  try {
    // Add cache-busting query param so we never get a stale page with old PDF filenames
    const bustUrl = new URL(sourceUrl);
    bustUrl.searchParams.set('_cb', Date.now().toString());
    const html = (await fetchUrl(bustUrl.toString())).toString('utf-8');
    // Derive base URL for resolving relative hrefs
    const parsedUrl = new URL(sourceUrl);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    const pdfPattern = /(?:href|src)="([^"]*\/sites\/utb\/files\/anticipated_calendars\/[^"]*\.pdf)"/gi;
    const seen = new Set<string>();
    const links: { url: string; filename: string }[] = [];
    let match;

    while ((match = pdfPattern.exec(html)) !== null) {
      const href = match[1];
      const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
      if (!seen.has(fullUrl)) {
        seen.add(fullUrl);
        const filename = fullUrl.split('/').pop() || '';
        links.push({ url: fullUrl, filename });
      }
    }

    return links;
  } catch (err) {
    console.error(`Failed to scrape ${sourceUrl}:`, err);
    return [];
  }
}

/**
 * Extract start and end dates from PDF filename.
 * Pattern: {CODE}-{ID}-{YYYYMMDD}-{YYYYMMDD}-{TIMESTAMP}.pdf
 */
function extractDateRange(filename: string): { start: Date; end: Date } | null {
  const match = filename.match(/(\d{8})-(\d{8})-\d+\.pdf$/i);
  if (!match) return null;
  const start = new Date(
    `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}T00:00:00.000Z`
  );
  const end = new Date(
    `${match[2].slice(0, 4)}-${match[2].slice(4, 6)}-${match[2].slice(6, 8)}T23:59:59.999Z`
  );
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
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
      if (existing.status !== data.status) {
        console.log(`[Calendar Import] Status change: ${entry.caseNumber} ${entry.hearingDate} ${entry.hearingTime} — ${existing.status} → ${data.status}`);
      }
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
  importProgress = { currentJudge: null, currentStep: 'Discovering calendars...', completedCalendars: 0, totalCalendars: 0, lastError: null };
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
    importProgress.totalCalendars = pdfLinks.length;

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
        entriesRemoved: 0,
        status: 'failed',
        errorMessage: 'No PDF calendars found',
        durationMs: 0,
      });
      isImportRunning = false;
      importProgress = null;
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
        importProgress!.currentJudge = judgeName;
        importProgress!.currentStep = `Downloading ${filename}`;

        console.log(`[Calendar Import] Downloading ${filename}...`);
        const pdfBuffer = await fetchUrl(url, true);

        importProgress!.currentStep = `Parsing calendar for ${judgeName}`;
        console.log(`[Calendar Import] Parsing ${filename} (${pdfBuffer.length} bytes)...`);
        const calendar = await parseCalendar(pdfBuffer, filename);

        importProgress!.currentStep = `Processing ${calendar.entries.length} entries for ${judgeName}`;
        console.log(`[Calendar Import] Found ${calendar.entries.length} entries for ${judgeName}`);

        let created = 0;
        let updated = 0;
        let skipped = 0;

        // Track all imported entry keys so we can remove stale ones
        const importedKeys = new Set<string>();

        for (const entry of calendar.entries) {
          const result = await upsertEntry(entry, judgeName);
          if (result === 'created') created++;
          else if (result === 'updated') updated++;
          else skipped++;
          importedKeys.add(`${entry.caseNumber}|${entry.hearingDate}|${entry.hearingTime}`);
        }

        // Remove stale entries for this judge:
        // 1. Entries within the PDF's date range that are no longer in the PDF
        // 2. Entries before the PDF's start date (past hearings no longer in any calendar)
        let removed = 0;
        const dateRange = extractDateRange(filename);
        if (dateRange) {
          const existingEntries = await prisma.docketEntry.findMany({
            where: {
              hearingJudge: judgeName,
              hearingDate: { lte: dateRange.end },
            },
            select: { id: true, caseNumber: true, hearingDate: true, hearingTime: true },
          });

          const staleIds = existingEntries
            .filter(e => {
              // Entries before the PDF's start date are always stale
              if (e.hearingDate < dateRange.start) return true;
              // Entries within the date range must still be in the PDF
              const dateStr = e.hearingDate.toISOString().split('T')[0];
              return !importedKeys.has(`${e.caseNumber}|${dateStr}|${e.hearingTime}`);
            })
            .map(e => e.id);

          if (staleIds.length > 0) {
            await prisma.docketEntry.deleteMany({ where: { id: { in: staleIds } } });
            removed = staleIds.length;
            console.log(`[Calendar Import] ${judgeName}: removed ${removed} stale entries`);
          }
        }

        const durationMs = Date.now() - startMs;

        await prisma.importLog.update({
          where: { id: logEntry.id },
          data: {
            entriesFound: calendar.entries.length,
            entriesCreated: created,
            entriesUpdated: updated,
            entriesSkipped: skipped,
            entriesRemoved: removed,
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
          entriesRemoved: removed,
          status: 'success',
          durationMs,
        });

        importProgress!.completedCalendars++;
        console.log(`[Calendar Import] ${judgeName}: ${created} created, ${updated} updated, ${skipped} skipped, ${removed} removed (${durationMs}ms)`);
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
          entriesRemoved: 0,
          status: 'failed',
          errorMessage,
          durationMs,
        });

        importProgress!.completedCalendars++;
        importProgress!.lastError = `${judgeName}: ${errorMessage}`;
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
    importProgress = null;
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
    progress: isImportRunning ? importProgress : null,
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
