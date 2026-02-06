import { PDFParse } from 'pdf-parse';

export interface ParsedCalendar {
  judgeName: string;
  judgeCode: string;
  entries: ParsedEntry[];
}

export interface ParsedEntry {
  hearingDate: string;       // YYYY-MM-DD
  hearingTime: string;       // HH:MM 24hr
  caseNumber: string;
  caseChapter: string;
  caseTitle: string;
  hearingMatter: string;
  adversaryNumber: string | null;
  adversaryTitle: string | null;
  movingParty: string | null;
  opposingParty: string | null;
  trustee: string | null;
  courtroom: string | null;
  isZoom: boolean;
  zoomMeetingId: string | null;
  zoomPasscode: string | null;
  zoomPhone: string | null;
  status: string;            // "scheduled" | "stricken" | "continued"
  comment: string | null;
}

// Judge code to full name mapping
const JUDGE_CODE_MAP: Record<string, string> = {
  'PH': 'Judge Peggy Hunt',
  'WTT': 'Judge William T. Thurman',
  'KRA': 'Judge Kevin R. Anderson',
  'CDP': 'Judge Cathleen D Parker',
  'MFT': 'Judge Michael F Thomson',
  'JTM': 'Judge Joel T. Marker',
};

/**
 * Extract judge code from PDF filename.
 * Pattern: {CODE}-{ID}-{START}-{END}-{TIMESTAMP}.pdf
 * Example: PH-906136-20260205-20260320-175839497.pdf
 */
export function extractJudgeCode(filename: string): string {
  const basename = filename.replace(/^.*\//, '').replace(/\.pdf$/i, '');
  const parts = basename.split('-');
  // The code may contain multiple parts before the numeric ID
  // Find the first part that looks like a numeric ID (6+ digits)
  let codeEndIdx = 0;
  for (let i = 0; i < parts.length; i++) {
    if (/^\d{4,}$/.test(parts[i])) {
      codeEndIdx = i;
      break;
    }
  }
  return parts.slice(0, codeEndIdx).join('-') || parts[0];
}

/**
 * Get judge full name from a judge code, or the code if unmapped.
 */
export function getJudgeName(code: string): string {
  return JUDGE_CODE_MAP[code] || code;
}

/**
 * Parse time from "HH:MM AM/PM" to "HH:MM" 24-hour format.
 */
function parseTime(timeStr: string): string {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return timeStr;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * Parse a date string like "Thursday, February 05, 2026" or "February 05, 2026"
 * Returns YYYY-MM-DD.
 */
function parseDateHeader(dateStr: string): string {
  // Remove day name prefix if present
  const cleaned = dateStr.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, '').trim();
  const parsed = new Date(cleaned);
  if (isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = (parsed.getMonth() + 1).toString().padStart(2, '0');
  const day = parsed.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a full PDF buffer into structured calendar data.
 */
export async function parseCalendar(buffer: Buffer, filename: string): Promise<ParsedCalendar> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  const text = result.text;
  await parser.destroy();
  const judgeCode = extractJudgeCode(filename);
  const judgeName = getJudgeName(judgeCode);

  const entries = parseText(text, judgeName);

  return {
    judgeName,
    judgeCode,
    entries,
  };
}

/**
 * Parse extracted PDF text into hearing entries.
 *
 * The PDF text has this structure per day:
 * - Header: "U.S. BANKRUPTCY COURT" / "FOR THE DISTRICT OF UTAH" / "Honorable [Name]" / "[Day], [Date]"
 * - Optional Zoom info block
 * - Hearing entries, each starting with a time like "10:30 AM"
 * - Footer: "Current as of..." / "Parameters..." / "Page X of Y"
 */
function parseText(text: string, judgeName: string): ParsedEntry[] {
  const lines = text.split('\n');
  const entries: ParsedEntry[] = [];

  let currentDate = '';
  let currentZoom = {
    isZoom: false,
    meetingId: null as string | null,
    passcode: null as string | null,
    phone: null as string | null,
  };

  // Regex patterns
  const dateLinePattern = /^\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\w+\s+\d{1,2},\s+\d{4})/i;
  const timeAndCasePattern = /^\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s+(\d{2}-\d{4,5})\s+(.*)/i;
  const zoomMeetingIdPattern = /Meeting\s+ID\s+([\d\s]+)/i;
  const zoomPasscodePattern = /Passcode\s+(\d+)/i;
  const zoomPhonePattern = /call\s+(\d\+\(?\d{3}\)?\s*\d{3}[\s-]\d{4})/i;
  const zoomHeaderPattern = /Judge\s+\w+\s+Zoom\s+Hearing/i;
  const chapterPattern = /^\s*(?:†)?Ch\s+(\d+)/i;
  const adversaryPattern = /^\s*(\d{2}-\d{4,5})\s+(.*)/;
  const trusteePattern = /Trustee:\s+(.+)/i;
  const movingPattern = /^\s*Moving:\s+(.*)/i;
  const opposingPattern = /^\s*Opposing:\s+(.*)/i;
  const matterPattern = /^\s*Matter:\s*(.*)/i;
  const commentPattern = /^\s*Comment:\s*(.*)/i;
  const strickenPattern = /Stricken\s+from\s+the\s+calendar/i;
  const continuedPattern = /Continued\s+to\s+/i;
  const pageFooterPattern = /^\s*Page\s+\d+\s+of\s+\d+/i;
  const parametersPattern = /^\s*Parameters:/i;
  const currentAsOfPattern = /^\s*Current\s+as\s+of/i;
  const printedForPattern = /^\s*Printed\s+for/i;
  const courtHeaderPattern = /^\s*U\.?S\.?\s+BANKRUPTCY\s+COURT/i;
  const districtPattern = /^\s*FOR\s+THE\s+DISTRICT/i;
  const honorablePattern = /^\s*Honorable\s+/i;
  const courtroomPattern = /^\s*Courtroom\s+(\S+)/i;

  // State for current entry being built
  let currentEntry: Partial<ParsedEntry> | null = null;
  let lastField = ''; // track which field we're appending continuation lines to
  let courtroomName: string | null = null;

  function finalizeEntry() {
    if (currentEntry && currentEntry.caseNumber && currentEntry.hearingDate && currentEntry.hearingTime) {
      entries.push({
        hearingDate: currentEntry.hearingDate!,
        hearingTime: currentEntry.hearingTime!,
        caseNumber: currentEntry.caseNumber!,
        caseChapter: currentEntry.caseChapter || '',
        caseTitle: (currentEntry.caseTitle || '').trim(),
        hearingMatter: (currentEntry.hearingMatter || '').trim(),
        adversaryNumber: currentEntry.adversaryNumber || null,
        adversaryTitle: (currentEntry.adversaryTitle || '').trim() || null,
        movingParty: (currentEntry.movingParty || '').trim() || null,
        opposingParty: (currentEntry.opposingParty || '').trim() || null,
        trustee: (currentEntry.trustee || '').trim() || null,
        courtroom: currentEntry.courtroom || courtroomName,
        isZoom: currentEntry.isZoom || false,
        zoomMeetingId: currentEntry.zoomMeetingId || null,
        zoomPasscode: currentEntry.zoomPasscode || null,
        zoomPhone: currentEntry.zoomPhone || null,
        status: currentEntry.status || 'scheduled',
        comment: (currentEntry.comment || '').trim() || null,
      });
    }
    currentEntry = null;
    lastField = '';
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip footer/header lines
    if (pageFooterPattern.test(line) || parametersPattern.test(line) ||
        currentAsOfPattern.test(line) || printedForPattern.test(line) ||
        courtHeaderPattern.test(line) || districtPattern.test(line)) {
      continue;
    }

    // Skip blank lines
    if (line.trim() === '') continue;

    // Parse judge name / date header
    if (honorablePattern.test(line)) {
      continue; // We already know the judge from the filename
    }

    const dateMatch = line.match(dateLinePattern);
    if (dateMatch) {
      finalizeEntry();
      currentDate = parseDateHeader(dateMatch[0].trim());
      // Reset zoom for new day section
      currentZoom = { isZoom: false, meetingId: null, passcode: null, phone: null };
      courtroomName = null;
      continue;
    }

    // Check for Zoom info in header block
    const meetingIdMatch = line.match(zoomMeetingIdPattern);
    if (meetingIdMatch) {
      currentZoom.isZoom = true;
      currentZoom.meetingId = meetingIdMatch[1].replace(/\s/g, ' ').trim();
      continue;
    }
    const passcodeMatch = line.match(zoomPasscodePattern);
    if (passcodeMatch) {
      currentZoom.passcode = passcodeMatch[1].trim();
      continue;
    }
    const phoneMatch = line.match(zoomPhonePattern);
    if (phoneMatch) {
      currentZoom.isZoom = true;
      currentZoom.phone = phoneMatch[1].replace(/[^\d+()-]/g, '').trim();
      continue;
    }
    if (zoomHeaderPattern.test(line)) {
      currentZoom.isZoom = true;
      // The passcode is often on this same line
      const inlinePasscode = line.match(zoomPasscodePattern);
      if (inlinePasscode) {
        currentZoom.passcode = inlinePasscode[1].trim();
      }
      continue;
    }

    // "This meeting is by Zoom" line
    if (/This\s+meeting\s+is\s+by\s+Zoom/i.test(line)) {
      currentZoom.isZoom = true;
      continue;
    }
    if (/ZoomGov\.com/i.test(line)) {
      const phonePart = line.match(/call\s+([\d+()\s-]+)/i);
      if (phonePart) {
        currentZoom.phone = phonePart[1].replace(/\s+/g, '').trim();
      }
      continue;
    }

    // Check for courtroom line (non-Zoom hearings)
    const courtroomMatch = line.match(courtroomPattern);
    if (courtroomMatch && !currentEntry) {
      courtroomName = courtroomMatch[1].trim();
      continue;
    }

    // New entry: time + case number + case title
    const timeAndCaseMatch = line.match(timeAndCasePattern);
    if (timeAndCaseMatch && currentDate) {
      finalizeEntry();
      currentEntry = {
        hearingDate: currentDate,
        hearingTime: parseTime(timeAndCaseMatch[1].trim()),
        caseNumber: timeAndCaseMatch[2].trim(),
        caseTitle: timeAndCaseMatch[3].trim(),
        caseChapter: '',
        hearingMatter: '',
        adversaryNumber: null,
        adversaryTitle: null,
        movingParty: null,
        opposingParty: null,
        trustee: null,
        courtroom: courtroomName,
        isZoom: currentZoom.isZoom,
        zoomMeetingId: currentZoom.meetingId,
        zoomPasscode: currentZoom.passcode,
        zoomPhone: currentZoom.phone,
        status: 'scheduled',
        comment: null,
      };
      lastField = 'caseTitle';
      continue;
    }

    // If we're not building an entry, skip
    if (!currentEntry) continue;

    // Chapter line (may include † for adversary)
    const chapterMatch = line.match(chapterPattern);
    if (chapterMatch) {
      currentEntry.caseChapter = chapterMatch[1];
      // Check for adversary marker (†)
      if (line.includes('†')) {
        // This is an adversary proceeding - the case number above is the adversary number
        // The next line should have the main case number and debtor name
      }
      // Check for trustee on same or separate line
      const trusteeSame = line.match(trusteePattern);
      if (trusteeSame) {
        currentEntry.trustee = trusteeSame[1].trim();
      }
      lastField = 'chapter';
      continue;
    }

    // Adversary case number + debtor name (line after †Ch)
    // These appear as an indented case number + debtor name, right after the chapter line
    if (lastField === 'chapter' && currentEntry.caseChapter) {
      const adversaryLineMatch = line.match(adversaryPattern);
      if (adversaryLineMatch && !movingPattern.test(line) && !opposingPattern.test(line) && !matterPattern.test(line)) {
        // This is the main case — swap: the original caseNumber was the AP number
        currentEntry.adversaryNumber = currentEntry.caseNumber;
        currentEntry.adversaryTitle = currentEntry.caseTitle;
        currentEntry.caseNumber = adversaryLineMatch[1].trim();
        currentEntry.caseTitle = adversaryLineMatch[2].trim();
        lastField = 'adversary';
        continue;
      }
    }

    // Trustee line (standalone)
    const trusteeMatch = line.match(trusteePattern);
    if (trusteeMatch && !matterPattern.test(line)) {
      currentEntry.trustee = trusteeMatch[1].trim();
      continue;
    }

    // Stricken
    if (strickenPattern.test(line)) {
      currentEntry.status = 'stricken';
      continue;
    }

    // Continued
    if (continuedPattern.test(line)) {
      currentEntry.status = 'continued';
      continue;
    }

    // Hearing type (e.g., "Confirmation Hearings", "Evidentiary Hearing")
    // These appear on lines by themselves, before the Moving: line
    // We'll treat them as part of the matter if no explicit Matter: has been set
    if (lastField === 'chapter' || lastField === 'adversary' || lastField === 'trustee') {
      if (!movingPattern.test(line) && !opposingPattern.test(line) &&
          !matterPattern.test(line) && !commentPattern.test(line) && !strickenPattern.test(line)) {
        // This might be a hearing type line (e.g., "Confirmation Hearings")
        const trimmed = line.trim();
        if (trimmed && !timeAndCasePattern.test(line) && !chapterPattern.test(line) && !trusteePattern.test(line)) {
          currentEntry.hearingMatter = trimmed;
          lastField = 'hearingType';
          continue;
        }
      }
    }

    // Moving party
    const movingMatch = line.match(movingPattern);
    if (movingMatch) {
      currentEntry.movingParty = movingMatch[1].trim();
      lastField = 'moving';
      continue;
    }

    // Opposing party
    const opposingMatch = line.match(opposingPattern);
    if (opposingMatch) {
      currentEntry.opposingParty = opposingMatch[1].trim();
      lastField = 'opposing';
      continue;
    }

    // Matter
    const matterMatch = line.match(matterPattern);
    if (matterMatch) {
      currentEntry.hearingMatter = matterMatch[1].trim();
      lastField = 'matter';
      continue;
    }

    // Comment
    const commentMatch = line.match(commentPattern);
    if (commentMatch) {
      currentEntry.comment = commentMatch[1].trim();
      lastField = 'comment';
      continue;
    }

    // Continuation lines for multi-line fields
    const trimmed = line.trim();
    if (trimmed && lastField) {
      if (lastField === 'matter') {
        currentEntry.hearingMatter = ((currentEntry.hearingMatter || '') + ' ' + trimmed).trim();
      } else if (lastField === 'moving') {
        // Additional moving party names
        currentEntry.movingParty = ((currentEntry.movingParty || '') + ', ' + trimmed).trim();
      } else if (lastField === 'opposing') {
        // Additional opposing party names
        currentEntry.opposingParty = ((currentEntry.opposingParty || '') + ', ' + trimmed).trim();
      } else if (lastField === 'comment') {
        currentEntry.comment = ((currentEntry.comment || '') + ' ' + trimmed).trim();
      } else if (lastField === 'caseTitle') {
        // Case title continuation (rare, but handle it)
        currentEntry.caseTitle = ((currentEntry.caseTitle || '') + ' ' + trimmed).trim();
      }
    }
  }

  // Finalize last entry
  finalizeEntry();

  return entries;
}
