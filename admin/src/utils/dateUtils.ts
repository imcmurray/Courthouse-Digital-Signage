/**
 * Get today's date as a YYYY-MM-DD string in the browser's local timezone.
 *
 * IMPORTANT: Do NOT use `new Date().toISOString().split('T')[0]` for this —
 * .toISOString() returns UTC, so after 5 PM Mountain Time (midnight UTC)
 * it rolls over to tomorrow's date.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
