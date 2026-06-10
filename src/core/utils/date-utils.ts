// File: utils/date-utils.ts

// ---------------------------------------------------------------------------
// Pure date utilities — zero external dependencies
// ---------------------------------------------------------------------------

/**
 * Zero-pad a number to at least 2 digits.
 */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Return today's date as YYYY-MM-DD (local time).
 *
 * @example
 *   today(); // '2024-06-15'
 */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Return the date `days` calendar days from today as YYYY-MM-DD (local time).
 *
 * @example
 *   futureDate(30); // '2024-07-15'
 */
export function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Return the date `days` calendar days before today as YYYY-MM-DD (local time).
 *
 * @example
 *   pastDate(90); // '2024-03-17'
 */
export function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Format a `Date` object using a simple token-based format string.
 *
 * Supported tokens:
 *   YYYY — 4-digit year
 *   MM   — 2-digit month (01-12)
 *   DD   — 2-digit day   (01-31)
 *
 * Tokens are replaced in the order listed above, so compound patterns like
 * `MM/DD/YYYY` work correctly.
 *
 * @example
 *   formatDate(new Date('2024-06-15'), 'MM/DD/YYYY'); // '06/15/2024'
 *   formatDate(new Date('2024-06-15'), 'YYYY.MM.DD'); // '2024.06.15'
 *   formatDate(new Date('2024-06-15'), 'DD-MM-YYYY'); // '15-06-2024'
 */
export function formatDate(date: Date, format: string): string {
  const yyyy = String(date.getFullYear());
  const mm   = pad2(date.getMonth() + 1);
  const dd   = pad2(date.getDate());

  return format
    .replace('YYYY', yyyy)
    .replace('MM', mm)
    .replace('DD', dd);
}
