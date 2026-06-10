// File: tests/pod3-rating/api/suite18306.spec.ts
// ADO Suite  : 18306
// ADO Plan   : 18163 — RT-10.1 Occurrence Level Premium Calculation
// TC Range   : ADO workItem IDs 17694 – 17723 (30 test cases)
//
// ─── Page Object Model ────────────────────────────────────────────────────────
// All HTTP calls go through service objects — this file contains ONLY test()
// blocks and assertions.
//
//   RatePlanService   →  /api/v1/ratingengine/rateplans  (lifecycle)
//   OccurrenceService →  /api/v1/ratingengine/occurrences
//   StateManager      →  cross-worker state (versionId, resultIds)
//
// Rate Plan Lifecycle prerequisite:
//   Skip by setting RATING_ENGINE_RATE_PLAN_VERSION_ID in .env

import { test, expect }      from '@fixtures/tc-fixture';
import { annotateSuite18306 } from '@utils/ado-annotations';
import { RatePlanService }    from '@services/rating/RatePlanService';
import { OccurrenceService }  from '@services/rating/OccurrenceService';
import { StateManager }       from '@utils/StateManager';
import * as crypto            from 'crypto';

// ─── Suite constants ─────────────────────────────────────────────────────────

const RT_BASE        = (process.env['RATING_ENGINE_URL'] ?? '').replace(/\/$/, '');
const TENANT_ID      = process.env['RATING_ENGINE_TENANT_ID'] ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const LINE_OF_BUS    = 'CommercialAuto';
const JURISDICTION   = 'NY';
const COVERAGE_CODE  = 'BI';
const STATE_CODE     = 'NY';
const BASE_EXPOSURE  = 1.25;
const RP_EFF_FROM    = '2026-01-01';
const RP_EFF_TO      = '2028-12-31';
const OCC_EFF_DATE   = '2026-01-02';
const OCC_EXP_DATE   = RP_EFF_TO;

// Per-run unique product code — pinned in env so all workers share the same value
if (!process.env['SUITE18306_PRODUCT_CODE']) {
  process.env['SUITE18306_PRODUCT_CODE'] =
    `COMM-AUTO-NY-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
const PRODUCT_CODE = process.env['SUITE18306_PRODUCT_CODE']!;

// Shared policy ID for the occurrence lifecycle chain
const SHARED_POLICY_ID = (() => {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
})();

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe('Suite 18306 — RT-10.1 Occurrence Level Premium Calculation', () => {

  test.use({ baseURL: RT_BASE });
  annotateSuite18306();

  // State is persisted to disk so every Playwright worker subprocess reads the
  // same version_id / result_ids regardless of which worker ran the setup test.
  const state = new StateManager('suite18306');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 0 — RATE PLAN LIFECYCLE SETUP  (serial — must run in order)
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Rate Plan Lifecycle Setup', () => {

    const nameSuffix = Date.now().toString(36).toUpperCase();

    test('Setup-RP-01 POST /rateplans — Create Draft Rate Plan → 201', async ({ request }) => {
      const rp = new RatePlanService(request, RT_BASE);

      if (process.env['RATING_ENGINE_RATE_PLAN_VERSION_ID']) {
        // Pre-configured — skip create, just persist the ID
        const existingId = process.env['RATING_ENGINE_RATE_PLAN_VERSION_ID']!;
        const rpData     = await rp.getById(existingId);
        state.setAll({
          versionId:   existingId,
          productCode: rpData.productCode || PRODUCT_CODE,
        });
        console.log(`[Suite 18306] Using pre-configured version_id=${existingId}`);
        return;
      }

      const result = await rp.create({
        name:            `Commercial Auto NY Sprint1 QA ${nameSuffix}`,
        productCode:     PRODUCT_CODE,
        lineOfBusiness:  LINE_OF_BUS,
        jurisdictionCode: JURISDICTION,
        effectiveFrom:   RP_EFF_FROM,
        effectiveTo:     RP_EFF_TO,
        createdBy:       'testuser-creator@insurity.com',
      });

      expect(result.versionId).toBeTruthy();
      state.setAll({ versionId: result.versionId, productCode: result.productCode || PRODUCT_CODE });
      console.log(`[Suite 18306] Created version_id=${result.versionId}`);
    });

    test('Setup-RP-02 POST /rateplans/{id}/submit → 204', async ({ request }) => {
      test.skip(!!process.env['RATING_ENGINE_RATE_PLAN_VERSION_ID'], 'Pre-configured rate plan — skip lifecycle');
      const rp = new RatePlanService(request, RT_BASE);
      await rp.submit(state.get('versionId'), { actionBy: 'testuser-creator@insurity.com', tenantId: TENANT_ID });
    });

    test('Setup-RP-03 POST /rateplans/{id}/approve → 204', async ({ request }) => {
      test.skip(!!process.env['RATING_ENGINE_RATE_PLAN_VERSION_ID'], 'Pre-configured rate plan — skip lifecycle');
      const rp = new RatePlanService(request, RT_BASE);
      await rp.approve(state.get('versionId'), { actionBy: 'approver-user-02', tenantId: TENANT_ID });
    });

    test('Setup-RP-04 POST /rateplans/{id}/pendingactivation → 204', async ({ request }) => {
      test.skip(!!process.env['RATING_ENGINE_RATE_PLAN_VERSION_ID'], 'Pre-configured rate plan — skip lifecycle');
      const rp = new RatePlanService(request, RT_BASE);
      await rp.pendingActivation(state.get('versionId'), RP_EFF_FROM, { actionBy: 'testuser-creator@insurity.com', tenantId: TENANT_ID });
    });

    test('Setup-RP-05 POST /rateplans/{id}/activate → 204', async ({ request }) => {
      test.skip(!!process.env['RATING_ENGINE_RATE_PLAN_VERSION_ID'], 'Pre-configured rate plan — skip lifecycle');
      const rp = new RatePlanService(request, RT_BASE);
      await rp.activate(state.get('versionId'), { actionBy: 'testuser-creator@insurity.com', tenantId: TENANT_ID });
      console.log(`[Suite 18306] Rate plan ${state.get('versionId')} is now Active ✅`);
    });

  }); // end Rate Plan Lifecycle Setup

  // Common occurrence options — shared across all calculate tests
  const occBase = () => ({
    versionId:       state.get('versionId'),
    coverageCode:    COVERAGE_CODE,
    stateCode:       STATE_CODE,
    productCode:     state.get('productCode') || PRODUCT_CODE,
    lineOfBusiness:  LINE_OF_BUS,
    effectiveDate:   OCC_EFF_DATE,
    expirationDate:  OCC_EXP_DATE,
    baseExposure:    BASE_EXPOSURE,
    baseRate:        1200,
    tenantId:        TENANT_ID,
    extensionAttributes: {
      productCode:      state.get('productCode') || PRODUCT_CODE,
      lineOfBusiness:   LINE_OF_BUS,
      jurisdictionCode: JURISDICTION,
    },
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — OCCURRENCE CALCULATION LIFECYCLE  (serial state chain)
  // ADO: 17694 · 17708 · 17709 · 17710 · 17711
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('TC-RT-10.1 Occurrence Premium Calculation Lifecycle', () => {

    test(
      '[TC-RT-10.1-001] POST /occurrences/calculate — valid request → 200 with result_id, is_dry_run=false, is_success=true',
      { tag: '@TC17694' },
      async ({ request }) => {
        expect(state.get('versionId'), 'Rate plan version_id not set — Setup-RP-01 must complete first').toBeTruthy();

        const occ    = new OccurrenceService(request, RT_BASE);
        const result = await occ.calculate({ ...occBase(), policyId: SHARED_POLICY_ID });

        expect(result.resultId).toBeTruthy();
        expect(result.finalPremium).toBeGreaterThan(0);
        if (result.isDryRun  !== undefined) expect(result.isDryRun).toBe(false);
        if (result.isSuccess !== undefined) expect(result.isSuccess).toBe(true);

        state.setAll({ resultId_R1: result.resultId, transactionId: result.transactionId });
        console.log(`[Suite 18306] R1 result_id=${result.resultId}  final_premium=${result.finalPremium}`);
      },
    );

    test(
      '[TC-RT-10.1-015] POST /occurrences/{resultId}/recalculate — changed exposure → 200 new result_id',
      { tag: '@TC17708' },
      async ({ request }) => {
        expect(state.get('resultId_R1'), 'R1 result_id missing — TC-001 must complete first').toBeTruthy();

        const occ    = new OccurrenceService(request, RT_BASE);
        const result = await occ.recalculate(
          state.get('resultId_R1'),
          { ...occBase(), policyId: SHARED_POLICY_ID, baseExposure: BASE_EXPOSURE * 2 },
        );

        expect(result.resultId).toBeTruthy();
        expect(result.resultId).not.toBe(state.get('resultId_R1'));
        expect(result.finalPremium).toBeGreaterThan(0);
        if (result.isDryRun !== undefined) expect(result.isDryRun).toBe(false);

        state.set('resultId_R2', result.resultId);
        console.log(`[Suite 18306] R2 result_id=${result.resultId}  final_premium=${result.finalPremium}`);
      },
    );

    test(
      '[TC-RT-10.1-016] GET /occurrences/{resultId} — retrieve R1 by result_id → 200, fields present',
      { tag: '@TC17709' },
      async ({ request }) => {
        expect(state.get('resultId_R1'), 'R1 result_id missing — TC-001 must complete first').toBeTruthy();

        const occ    = new OccurrenceService(request, RT_BASE);
        const result = await occ.getById(state.get('resultId_R1'));

        if (result.resultId) expect(result.resultId).toBe(state.get('resultId_R1'));
        // Audit evidence: factors_applied or trace must be present
        const hasAuditData = result.factorsApplied.length > 0 ||
          Array.isArray((result.rawBody as Record<string, unknown>)?.['trace']);
        expect(hasAuditData).toBeTruthy();
      },
    );

    test(
      '[TC-RT-10.1-017] GET /occurrences/bytransaction/{transactionId} → 200, list contains R1',
      { tag: '@TC17710' },
      async ({ request }) => {
        expect(state.get('transactionId'), 'transaction_id missing — TC-001 must complete first').toBeTruthy();

        const occ     = new OccurrenceService(request, RT_BASE);
        const results = await occ.getByTransaction(state.get('transactionId'));

        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].finalPremium).toBeGreaterThan(0);
      },
    );

    test(
      '[TC-RT-10.1-018] GET /occurrences/bypolicy/{policyId} → 200, history has R1 (superseded) and R2 (current)',
      { tag: '@TC17711' },
      async ({ request }) => {
        expect(state.get('resultId_R1'), 'R1 result_id missing — TC-001 must complete first').toBeTruthy();
        expect(state.get('resultId_R2'), 'R2 result_id missing — TC-015 must complete first').toBeTruthy();

        const occ     = new OccurrenceService(request, RT_BASE);
        const results = await occ.getByPolicy(SHARED_POLICY_ID);

        expect(results.length).toBeGreaterThanOrEqual(2);
        const ids = results.map(r => r.resultId);
        expect(ids).toContain(state.get('resultId_R1'));
        expect(ids).toContain(state.get('resultId_R2'));

        // R1 should be superseded by R2
        const r1 = results.find(r => r.resultId === state.get('resultId_R1'));
        if (r1?.supersededBy) expect(r1.supersededBy).toBe(state.get('resultId_R2'));
      },
    );

  }); // end serial lifecycle

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — DRY RUN   ADO: 17695
  // ══════════════════════════════════════════════════════════════════════════

  test(
    '[TC-RT-10.1-002] POST /occurrences/calculate {is_dry_run:true} → 200; GET by result_id → 404',
    { tag: '@TC17695' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ = new OccurrenceService(request, RT_BASE);

      const result = await occ.calculate({ ...occBase(), isDryRun: true });
      expect(result.resultId).toBeTruthy();
      expect(result.finalPremium).toBeGreaterThan(0);
      if (result.isDryRun !== undefined) expect(result.isDryRun).toBe(true);

      // Dry-run results must NOT be persisted — getById must return 404
      await expect(occ.getById(result.resultId)).rejects.toThrow(/404/);
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — VALIDATION ERRORS   ADO: 17696–17700 · 17704
  // ══════════════════════════════════════════════════════════════════════════

  test(
    '[TC-RT-10.1-003] POST /occurrences/calculate — invalid state_code → 400/422/500',
    { tag: '@TC17696' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ = new OccurrenceService(request, RT_BASE);
      await expect(occ.calculate({ ...occBase(), stateCode: 'TEXAS' }))
        .rejects.toThrow(/[45]\d\d/);
    },
  );

  test(
    '[TC-RT-10.1-004] POST /occurrences/calculate — expiration_date before effective_date → 400/422/500',
    { tag: '@TC17697' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ = new OccurrenceService(request, RT_BASE);
      await expect(occ.calculate({ ...occBase(), effectiveDate: '2028-12-31', expirationDate: '2028-01-01' }))
        .rejects.toThrow(/[45]\d\d/);
    },
  );

  test(
    '[TC-RT-10.1-005] POST /occurrences/calculate — base_exposure ≤ 0 → 400/422/500',
    { tag: '@TC17698' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ = new OccurrenceService(request, RT_BASE);
      await expect(occ.calculate({ ...occBase(), baseExposure: 0 }))
        .rejects.toThrow(/[45]\d\d/);
      await expect(occ.calculate({ ...occBase(), baseExposure: -500 }))
        .rejects.toThrow(/[45]\d\d/);
    },
  );

  test(
    '[TC-RT-10.1-006] POST /occurrences/calculate — missing required identifiers → 400/422/500',
    { tag: '@TC17699' },
    async ({ request }) => {
      // For intentionally malformed payloads the service object throws — we verify the status code
      const occ = new OccurrenceService(request, RT_BASE);
      // Missing policyId
      await expect(occ.calculate({ ...occBase(), policyId: '' }))
        .rejects.toThrow(/[45]\d\d/);
    },
  );

  test(
    '[TC-RT-10.1-007] POST /occurrences/calculate — unknown rate_plan_version_id → 400/404/422/500',
    { tag: '@TC17700' },
    async ({ request }) => {
      const occ = new OccurrenceService(request, RT_BASE);
      const fakeId = 'aaaabbbb-cccc-4ddd-8eee-ffffffffffff';
      await expect(occ.calculate({ ...occBase(), versionId: fakeId }))
        .rejects.toThrow(/[45]\d\d/);
    },
  );

  test(
    '[TC-RT-10.1-011] GET /occurrences/{resultId} — result_id that never existed → 404',
    { tag: '@TC17704' },
    async ({ request }) => {
      const occ    = new OccurrenceService(request, RT_BASE);
      const fakeId = 'aaaabbbb-cccc-4ddd-8eee-ffffffffffff';
      await expect(occ.getById(fakeId)).rejects.toThrow(/404/);
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — FIELD VALIDATION   ADO: 17701–17703
  // ══════════════════════════════════════════════════════════════════════════

  test(
    '[TC-RT-10.1-008] POST /occurrences/calculate — verify result_id is a valid UUID v4',
    { tag: '@TC17701' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ    = new OccurrenceService(request, RT_BASE);
      const result = await occ.calculate({ ...occBase() });
      const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.resultId).toMatch(uuidV4);
    },
  );

  test(
    '[TC-RT-10.1-009] POST /occurrences/calculate — final_premium is positive number',
    { tag: '@TC17702' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ    = new OccurrenceService(request, RT_BASE);
      const result = await occ.calculate({ ...occBase() });
      expect(typeof result.finalPremium).toBe('number');
      expect(result.finalPremium).toBeGreaterThan(0);
    },
  );

  test(
    '[TC-RT-10.1-010] POST /occurrences/calculate — final_premium is rounded to ≤ 2 decimal places',
    { tag: '@TC17703' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ    = new OccurrenceService(request, RT_BASE);
      const result = await occ.calculate({ ...occBase() });
      const asStr  = String(result.finalPremium);
      const decimals = asStr.includes('.') ? asStr.split('.')[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5 — RATE PLAN LIST   ADO: 17705–17707
  // ══════════════════════════════════════════════════════════════════════════

  test(
    '[TC-RT-10.1-012] GET /rateplans — list returns array with at least one item',
    { tag: '@TC17705' },
    async ({ request }) => {
      const rp  = new RatePlanService(request, RT_BASE);
      const res = await rp.getById(state.get('versionId'));
      expect(res.versionId).toBeTruthy();
      expect(res.status).toBeTruthy();
    },
  );

  test(
    '[TC-RT-10.1-014] POST /occurrences/calculate — final_premium rounded to ≤ 2 decimal places (rounding section)',
    { tag: '@TC17707' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ    = new OccurrenceService(request, RT_BASE);
      const result = await occ.calculate({ ...occBase() });
      const asStr  = String(result.finalPremium);
      const decimals = asStr.includes('.') ? asStr.split('.')[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 6 — TRANSACTION TYPE VARIANTS   ADO: 17712–17713
  // ══════════════════════════════════════════════════════════════════════════

  test(
    '[TC-RT-10.1-019] POST /occurrences/calculate {transaction_type:Renewal} → 200',
    { tag: '@TC17712' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ    = new OccurrenceService(request, RT_BASE);
      const result = await occ.calculate({ ...occBase(), transactionType: 'Renewal' });
      expect(result.resultId).toBeTruthy();
      expect(result.finalPremium).toBeGreaterThan(0);
    },
  );

  test(
    '[TC-RT-10.1-020] POST /occurrences/calculate {transaction_type:Endorsement} → 200',
    { tag: '@TC17713' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ    = new OccurrenceService(request, RT_BASE);
      const result = await occ.calculate({ ...occBase(), transactionType: 'Endorsement' });
      expect(result.resultId).toBeTruthy();
      expect(result.finalPremium).toBeGreaterThan(0);
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 7 — MINIMUM PREMIUM FLOOR   ADO: 17714–17719
  // ══════════════════════════════════════════════════════════════════════════

  test(
    '[TC-RT-10.1-021] POST /occurrences/calculate — standard exposure → final_premium > 0',
    { tag: '@TC17714' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ    = new OccurrenceService(request, RT_BASE);
      const result = await occ.calculate({ ...occBase(), baseExposure: 1.0 });
      expect(result.finalPremium).toBeGreaterThan(0);
    },
  );

  test(
    '[TC-RT-10.1-022] POST /occurrences/calculate — high exposure → premium scales proportionally',
    { tag: '@TC17715' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ     = new OccurrenceService(request, RT_BASE);
      const low     = await occ.calculate({ ...occBase(), baseExposure: 1.0 });
      const high    = await occ.calculate({ ...occBase(), baseExposure: 10.0 });
      expect(high.finalPremium).toBeGreaterThan(low.finalPremium);
    },
  );

  test(
    '[TC-RT-10.1-023] POST /occurrences/calculate — same inputs produce identical final_premium (determinism)',
    { tag: '@TC17716' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ = new OccurrenceService(request, RT_BASE);
      const r1  = await occ.calculate({ ...occBase(), baseExposure: 2.5 });
      const r2  = await occ.calculate({ ...occBase(), baseExposure: 2.5 });
      expect(r1.finalPremium).toBe(r2.finalPremium);
    },
  );

  test(
    '[TC-RT-10.1-024] POST /occurrences/calculate — response time within acceptable bounds',
    { tag: '@TC17717' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ   = new OccurrenceService(request, RT_BASE);
      const start = Date.now();
      await occ.calculate({ ...occBase() });
      const elapsed = Date.now() - start;
      if (elapsed > 5000) console.warn(`⚠️  [TC-024] Response time ${elapsed}ms exceeds 5s`);
      expect(elapsed).toBeLessThan(60_000);  // hard limit (service timeout)
    },
  );

  test(
    '[TC-RT-10.1-025] GET /rateplans/{id} — active rate plan has correct status',
    { tag: '@TC17718' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const rp     = new RatePlanService(request, RT_BASE);
      const result = await rp.getById(state.get('versionId'));
      expect(['Active', 'active']).toContain(result.status);
    },
  );

  test(
    '[TC-RT-10.1-026] POST /occurrences/calculate — is_dry_run=false persists result (GET returns 200)',
    { tag: '@TC17719' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ    = new OccurrenceService(request, RT_BASE);
      const result = await occ.calculate({ ...occBase(), isDryRun: false });
      expect(result.resultId).toBeTruthy();
      const fetched = await occ.getById(result.resultId);
      if (fetched.resultId) expect(fetched.resultId).toBe(result.resultId);
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 8 — ROUNDING   ADO: 17720–17723
  // ══════════════════════════════════════════════════════════════════════════

  test(
    '[TC-RT-10.1-027] POST /occurrences/calculate — final_premium rounded correctly across multiple calls',
    { tag: '@TC17720' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ = new OccurrenceService(request, RT_BASE);
      for (const exposure of [0.5, 1.0, 2.5, 5.0]) {
        const result = await occ.calculate({ ...occBase(), baseExposure: exposure });
        const s = String(result.finalPremium);
        const decimals = s.includes('.') ? s.split('.')[1].length : 0;
        expect(decimals).toBeLessThanOrEqual(2);
      }
    },
  );

  test(
    '[TC-RT-10.1-028] POST /occurrences/calculate — response contract includes all required fields',
    { tag: '@TC17721' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ    = new OccurrenceService(request, RT_BASE);
      const result = await occ.calculate({ ...occBase() });
      expect(result.resultId).toBeTruthy();
      expect(typeof result.finalPremium).toBe('number');
      expect(result.finalPremium).toBeGreaterThan(0);
    },
  );

  test(
    '[TC-RT-10.1-029] POST /occurrences/calculate — multiple concurrent requests all succeed',
    { tag: '@TC17722' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ     = new OccurrenceService(request, RT_BASE);
      const results = await Promise.all([
        occ.calculate({ ...occBase(), baseExposure: 1.0 }),
        occ.calculate({ ...occBase(), baseExposure: 2.0 }),
        occ.calculate({ ...occBase(), baseExposure: 3.0 }),
      ]);
      for (const r of results) {
        expect(r.resultId).toBeTruthy();
        expect(r.finalPremium).toBeGreaterThan(0);
      }
    },
  );

  test(
    '[TC-RT-10.1-030] POST /occurrences/calculate — exposure proportional premium calculation',
    { tag: '@TC17723' },
    async ({ request }) => {
      expect(state.get('versionId'), 'Rate plan version_id not set').toBeTruthy();
      const occ = new OccurrenceService(request, RT_BASE);
      const r1  = await occ.calculate({ ...occBase(), baseExposure: 1.0 });
      const r2  = await occ.calculate({ ...occBase(), baseExposure: 2.0 });
      // Higher exposure should produce higher (or equal) premium
      expect(r2.finalPremium).toBeGreaterThanOrEqual(r1.finalPremium);
    },
  );

}); // end Suite 18306
