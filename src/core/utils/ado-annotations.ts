/**
 * utils/ado-annotations.ts
 *
 * Reusable ADO annotation helper — thin façade over fixtures/tc-fixture.ts.
 *
 * All spec files should import suite annotation helpers from this module so
 * that the injection logic stays in one place and specs stay lean.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────────
 *
 *   import { useSuiteAnnotations } from '@utils/ado-annotations';
 *   // (or the suite-specific convenience wrapper below)
 *
 *   test.describe('Suite 18306 — ...', () => {
 *     useSuiteAnnotations('18306', '18163');  // stamps all 4 ADO annotations
 *     ...
 *   });
 *
 * ─── What it stamps ───────────────────────────────────────────────────────────
 *
 *   TestCaseID   TC-RT-10.1-001   ← human tag extracted from [TC-xxx] in title
 *   ADO_CaseID   17694            ← actual ADO work-item numeric ID
 *   ADO_SuiteID  18306
 *   ADO_PlanID   18163
 *
 * ─── Resolution order ─────────────────────────────────────────────────────────
 *
 *   0. @TC<workItemId> Playwright tag    — highest priority; embed in spec directly
 *   1. tc-map-pod3-<suiteId>.json file   — explicit override map
 *   2. Direct numeric TC-<id> tag        — numeric TC tag style
 *   3. ado-cases-pod3-<suiteId>.json     — tcTag field lookup
 *   4. Title substring match             — fallback
 */

// Re-export the core annotation injector so specs can import from one place.
export { useSuiteAnnotations } from '../fixtures/tc-fixture';

// ─── Suite-specific convenience wrappers ─────────────────────────────────────
// Import useSuiteAnnotations and call it with known suite/plan IDs for each
// suite, so individual spec files only need:
//   import { annotateSuite18306 } from '@utils/ado-annotations';
//   test.describe('Suite 18306 ...', () => { annotateSuite18306(); ... });

import { useSuiteAnnotations } from '../fixtures/tc-fixture';

/** Suite 18306 — Occurrence Level Premium Calculation (Plan 18163) */
export function annotateSuite18306(): void {
  useSuiteAnnotations('18306', '18163');
}

/** Suite 18187 — Base Premium Calculation (Plan 18163) */
export function annotateSuite18187(): void {
  useSuiteAnnotations('18187', '18163');
}

/** Suite 18181 — Flexible Data Model Support (Plan 18163) */
export function annotateSuite18181(): void {
  useSuiteAnnotations('18181', '18163');
}

/** Suite 18186 — Audit Log, Version History & Rollback (Plan 18163) */
export function annotateSuite18186(): void {
  useSuiteAnnotations('18186', '18163');
}

/** Suite 18180 — Separation of Rules (Plan 18163) */
export function annotateSuite18180(): void {
  useSuiteAnnotations('18180', '18163');
}

/** Suite 18178 — API First Rule Integration (Plan 14019) */
export function annotateSuite18178(): void {
  useSuiteAnnotations('18178', '14019');
}

/** Suite 18191 — Real Time Rule Execution (US-3.1, Plan 18163) */
export function annotateSuite18191(): void {
  useSuiteAnnotations('18191', '18163');
}

/** Suite 19725 — FSD 21.3: RESTful APIs and Backward Compatibility (Plan 18163) */
export function annotateSuite19725(): void {
  useSuiteAnnotations('19725', '18163');
}

/** Suite 18304 — Extract Rating Formulas and Algorithms — Rating Engine (Plan 18163) */
export function annotateSuite18304(): void {
  useSuiteAnnotations('18304', '18163');
}

/** Suite 18303 — Rate Plan Versioning Lifecycle — Rating Engine (Plan 18163) */
export function annotateSuite18303(): void {
  useSuiteAnnotations('18303', '18163');
}

/** Suite 18177 — Leap Year Calculation — Rating Engine (Plan 18163) */
export function annotateSuite18177(): void {
  useSuiteAnnotations('18177', '18163');
}

/** Suite 18307 — RT-21.1: External System Integration — Rating Engine M2M (Plan 18163) */
export function annotateSuite18307(): void {
  useSuiteAnnotations('18307', '18163');
}
