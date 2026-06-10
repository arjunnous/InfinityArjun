/**
 * utils/tc-tag.ts
 *
 * Pure string utilities for Test Case ID handling.
 * No Playwright imports — safe to use anywhere (fixtures, reporters, scripts).
 *
 * Supported TC ID formats in test titles:
 *   [TC-17346]      — numeric ADO work item ID
 *   [TC-4.2-01]     — user-story-scoped ID (US.TC)
 *   [TC-17342-a]    — lettered sub-case
 */

/**
 * Extracts the TC ID from a Playwright test title.
 *
 * Matches the first occurrence of [TC-<identifier>] anywhere in the title.
 * The returned value includes the "TC-" prefix but not the surrounding brackets.
 *
 * @param title  Full test title string (e.g. "[TC-17346] GET /api/v1/rules returns 200")
 * @returns      "TC-17346" | "TC-4.2-01" | null (if no match)
 *
 * @example
 *   extractTcId('[TC-17346] GET /api/v1/rules returns 200') // → 'TC-17346'
 *   extractTcId('[TC-4.2-01] Deploy Active rule → 201')     // → 'TC-4.2-01'
 *   extractTcId('Setup: Create rule')                        // → null  (setup step, no TC id)
 */
export function extractTcId(title: string): string | null {
  // Pattern: literal "[TC-", then one or more word chars / dots / hyphens, then "]"
  const match = title.match(/\[TC-([\w.\-]+)\]/);
  return match ? `TC-${match[1]}` : null;
}

/**
 * Returns true when the given title contains a recognisable TC ID.
 *
 * @example
 *   hasTcId('[TC-17346] some test')  // → true
 *   hasTcId('Setup: Create rule')    // → false
 */
export function hasTcId(title: string): boolean {
  return extractTcId(title) !== null;
}
