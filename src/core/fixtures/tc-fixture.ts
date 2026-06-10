/**
 * fixtures/tc-fixture.ts
 *
 * Stamps every test with TestCaseID, ADO_CaseID, ADO_SuiteID, and ADO_PlanID
 * annotations so all four values appear in the Playwright HTML report.
 *
 * ─── Annotation set per test ──────────────────────────────────────────────────
 *
 *   TestCaseID   TC-4.3-001       ← human tag extracted from [TC-4.3-001] in title
 *   ADO_CaseID   18502            ← actual ADO work-item numeric ID (from JSON cache)
 *   ADO_SuiteID  18181
 *   ADO_PlanID   18163
 *
 * ─── ADO cache lookup ─────────────────────────────────────────────────────────
 *
 *   Tries to load test-data/ado-cases-pod3-<suiteId>.json. If the file is absent
 *   (e.g. fetch-testcases hasn't run yet) ADO_CaseID is omitted — no crash.
 *
 * ─── Key: Playwright uses 'description', NOT 'value' ─────────────────────────
 *
 *   testInfo.annotations interface:  { type: string; description?: string }
 *   Using 'value' silently discards content — the HTML report renders nothing.
 *   All pushes in this file use 'description'.
 */

import * as fs   from 'fs';
import * as path from 'path';
import { test as base } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { extractTcId } from '@utils/tc-tag';
import type { TestCaseItem } from '../../../integrations/ado/ado-test-case-reader';

// ─── Re-exports ───────────────────────────────────────────────────────────────
export const test = base;
export { expect } from '@playwright/test';

// ─── Module-level caches (loaded once per suite per process) ─────────────────
const _cacheByFile = new Map<string, TestCaseItem[]>();
const _tcMapByFile = new Map<string, Map<string, number>>();

/**
 * Returns the path to the explicit TC tag → ADO ID override map for a given suiteId.
 * Format: test-data/tc-map-pod3-<suiteId>.json
 * Auto-detects: checks if the file exists for any suite ID — no hardcoded list needed.
 * Adding a new suite tc-map file is the only step required to enable ID resolution.
 */
function tcMapFilePath(suiteId: string): string | null {
  const base     = path.resolve(__dirname, '../test-data/tc-maps');
  const candidate = path.join(base, `tc-map-pod3-${suiteId}.json`);
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Loads (and caches) the TC tag → ADO case ID map for a given suiteId.
 * The JSON file shape: { "map": { "TC-4.3-001": 17401, ... } }
 * Returns an empty Map when the file doesn't exist — callers handle gracefully.
 */
function loadTcMap(suiteId: string): Map<string, number> {
  const filePath = tcMapFilePath(suiteId);
  if (!filePath) return new Map();
  if (_tcMapByFile.has(filePath)) return _tcMapByFile.get(filePath)!;

  if (!fs.existsSync(filePath)) {
    console.log(`[DEBUG tc-fixture] TC map not found: ${filePath} — ADO IDs will fall back to cache lookup`);
    _tcMapByFile.set(filePath, new Map());
    return new Map();
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { map?: Record<string, number> };
    const entries = raw.map ?? raw as unknown as Record<string, number>;
    const map = new Map(Object.entries(entries).map(([k, v]) => [k, Number(v)]));
    console.log(`[DEBUG tc-fixture] Loaded ${map.size} TC→ADO mappings from ${path.basename(filePath)}`);
    _tcMapByFile.set(filePath, map);
    return map;
  } catch (err) {
    console.warn(`[DEBUG tc-fixture] Failed to parse TC map ${filePath}: ${err}`);
    _tcMapByFile.set(filePath, new Map());
    return new Map();
  }
}

/**
 * Returns the path to the pre-fetched ADO test-case JSON for a given suiteId.
 * Pod 3 suites: test-data/ado-cases-pod3-<suiteId>.json
 * Returns null when no matching file convention is known.
 */
function adoCacheFilePath(suiteId: string): string | null {
  const base = path.resolve(__dirname, '../test-data/ado-cases');

  // Auto-detect pod3 ADO cases file — no hardcoded suite list needed
  const pod3Candidate = path.join(base, `ado-cases-pod3-${suiteId}.json`);
  if (fs.existsSync(pod3Candidate)) return pod3Candidate;

  return null;
}

/**
 * Loads (and caches) the pre-fetched ADO test cases for a given suiteId.
 * Returns an empty array when the file doesn't exist — callers must handle gracefully.
 */
function loadAdoCache(suiteId: string): TestCaseItem[] {
  const filePath = adoCacheFilePath(suiteId);
  if (!filePath) return [];
  if (_cacheByFile.has(filePath)) return _cacheByFile.get(filePath)!;

  if (!fs.existsSync(filePath)) {
    console.log(`[DEBUG tc-fixture] ADO cache not found: ${filePath} — run fetch-testcases first`);
    _cacheByFile.set(filePath, []);
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as TestCaseItem[];
    console.log(`[DEBUG tc-fixture] Loaded ${raw.length} ADO cases from ${path.basename(filePath)}`);
    _cacheByFile.set(filePath, raw);
    return raw;
  } catch (err) {
    console.warn(`[DEBUG tc-fixture] Failed to parse ${filePath}: ${err}`);
    _cacheByFile.set(filePath, []);
    return [];
  }
}

/**
 * Extracts an ADO work-item ID from a Playwright test's tags array.
 *
 * Looks for a tag matching the pattern @TC<5+digits>, e.g. "@TC17401".
 * This tag is set in the spec: test('...', { tag: '@TC17401' }, async () => { ... })
 * The ID is the ADO workItem.id — the same "TEST CASE XXXXX" shown in the ADO UI.
 *
 * Returns 0 when no @TC<id> tag is present.
 */
function adoIdFromTag(tags: string[]): number {
  // Match exactly: @ + TC + 5 or more digits (no letters, no hyphens after TC)
  const tag = tags.find(t => /^@TC\d{5,}$/.test(t));
  if (!tag) return 0;
  const id = parseInt(tag.slice(3), 10); // strip "@TC"
  console.log(`[DEBUG tc-fixture] adoIdFromTag: found tag "${tag}" → ADO workItem.id=${id}`);
  return isNaN(id) ? 0 : id;
}

/**
 * Resolves the actual ADO work-item numeric ID for a given TC tag.
 *
 * Resolution order (highest → lowest priority):
 *  0. @TC<id> Playwright tag on the test  — set directly in spec { tag: '@TC17401' }
 *     ← Most reliable: embeds workItem.id from ADO UI directly in the test definition.
 *  1. Explicit TC map file (tc-map-pod3-<suiteId>.json) — fallback for suites without tags.
 *  2. Direct numeric IDs (TC-17461 → 17461) — works for suites with numeric TC tags.
 *  3. JSON cache lookup by tcTag field (from ado-cases-pod3-<suiteId>.json).
 *  4. JSON cache lookup by title containing the TC tag.
 *  5. Returns 0 when no match found.
 */
function resolveAdoCaseId(
  tcTag:    string,
  cache:    TestCaseItem[],
  tcMap?:   Map<string, number>,
  tagId?:   number,            // extracted from @TC<id> tag — highest priority
): number {
  // Priority 0: @TC<workItemId> tag — the ADO work-item ID embedded directly in the test
  if (tagId && tagId > 0) return tagId;

  // Priority 1: explicit map override (covers ADO suites whose titles lack TC tag prefixes)
  if (tcMap && tcMap.has(tcTag)) {
    const mapped = tcMap.get(tcTag)!;
    console.log(`[DEBUG tc-fixture] resolveAdoCaseId: "${tcTag}" → ${mapped} (tc-map override)`);
    return mapped;
  }

  // Priority 2: TC-<5+digits> → direct numeric ADO work-item ID
  const directMatch = tcTag.match(/^TC-(\d{5,})$/i);
  if (directMatch) return parseInt(directMatch[1], 10);

  // Priority 3: cache lookup by tcTag field
  const entry = cache.find(c => c.tcTag === tcTag);
  if (entry) return entry.id;

  // Priority 4: cache lookup by title containing the TC tag
  const titleEntry = cache.find(c => c.title.includes(tcTag));
  if (titleEntry) return titleEntry.id;

  return 0;
}

// ─── Primary annotation helper ────────────────────────────────────────────────

/**
 * Call once inside a test.describe() block.
 *
 * Registers a test.beforeEach that stamps four annotations on every test:
 *   TestCaseID   → human TC tag (e.g. "TC-4.3-001") extracted from test title
 *   ADO_CaseID   → actual ADO work-item numeric ID looked up from JSON cache
 *   ADO_SuiteID  → ADO Test Suite ID
 *   ADO_PlanID   → ADO Test Plan ID
 *
 * @param suiteId  ADO Test Suite ID (e.g. '18181')
 * @param planId   ADO Test Plan ID   (e.g. '18163')
 *
 * @example
 *   test.describe('Suite 18181 — Flexible Data Model', () => {
 *     useSuiteAnnotations('18181', '18163');
 *     ...
 *   });
 */
export function useSuiteAnnotations(suiteId: string, planId: string): void {
  // Pre-load both lookup sources once when the describe block is registered
  const cache = loadAdoCache(suiteId);
  const tcMap = loadTcMap(suiteId);

  test.beforeEach(({}, testInfo: TestInfo) => {
    // ── 0. @TC<id> tag — ADO workItem.id embedded directly in the spec ───────
    //    Pattern: @TC17401  (@ + TC + 5+ digits, no hyphens/letters after TC)
    //    This tag is set in the spec: test('...', { tag: '@TC17401' }, async () => { ... })
    const tagId = adoIdFromTag(testInfo.tags ?? []);

    // ── 1. TestCaseID — human tag extracted from [TC-xxxxx] in the test title ──
    const tcTag = extractTcId(testInfo.title);
    if (tcTag !== null) {
      testInfo.annotations.push({ type: 'TestCaseID', description: tcTag });
    }

    // ── 2. ADO_CaseID — actual ADO work-item numeric ID ─────────────────────
    //    Resolution order: @TC tag → tc-map override → direct numeric → cache
    const adoCaseId = tcTag !== null
      ? resolveAdoCaseId(tcTag, cache, tcMap, tagId)
      : tagId;   // test has no [TC-xxx] title tag but has @TC<id> — use tag directly

    if (adoCaseId > 0) {
      testInfo.annotations.push({ type: 'ADO_CaseID', description: String(adoCaseId) });
      const source = tagId > 0 ? '@TC tag' : (tcMap?.has(tcTag ?? '') ? 'tc-map' : 'cache');
      console.log(
        `[DEBUG tc-fixture] "${testInfo.title.slice(0, 60)}"` +
        `  tcTag=${tcTag ?? '(none)'}  ADO_CaseID=${adoCaseId}  source=${source}`
      );
    } else {
      console.log(
        `[DEBUG tc-fixture] "${testInfo.title.slice(0, 60)}"` +
        `  tcTag=${tcTag ?? '(none)'}  ADO_CaseID=NOT FOUND`
      );
    }

    // ── 3. ADO_SuiteID and ADO_PlanID — always stamped ──────────────────────
    testInfo.annotations.push({ type: 'ADO_SuiteID', description: suiteId });
    testInfo.annotations.push({ type: 'ADO_PlanID',  description: planId  });
  });
}

// ─── Legacy export (kept for backward compatibility) ─────────────────────────

/** @deprecated Use useSuiteAnnotations() inside test.describe() instead. */
export function annotateSuite(testInfo: TestInfo, suiteId: string, planId: string): void {
  testInfo.annotations.push({ type: 'ADO_SuiteID', description: suiteId });
  testInfo.annotations.push({ type: 'ADO_PlanID',  description: planId  });
}
