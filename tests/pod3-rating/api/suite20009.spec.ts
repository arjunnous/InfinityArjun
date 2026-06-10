// File: tests/pod3-rating/api/suite20009.spec.ts
// ADO Suite  : 20009
// ADO Plan   : 18163 — Real Time Access to Policy and Risk Data
//
// ─── Page Object Model ────────────────────────────────────────────────────────
// All HTTP calls go through service objects — this file has ONLY test() blocks.
//
//   RatePlanService   → lifecycle prerequisite
//   OccurrenceService → POST /occurrences/calculate → get executionId
//   PolicyDataService → snapshot / accesslogs / search / export

import { test, expect, useSuiteAnnotations } from '@fixtures/tc-fixture';
import { RatePlanService }                    from '@services/rating/RatePlanService';
import { OccurrenceService }                  from '@services/rating/OccurrenceService';
import { PolicyDataService }                  from '@services/rating/PolicyDataService';
import { StateManager }                       from '@utils/StateManager';
import * as crypto                            from 'crypto';

const RT_BASE  = (process.env['RATING_ENGINE_URL'] ?? '').replace(/\/$/, '');
const TENANT   = process.env['RATING_ENGINE_TENANT_ID'] ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PRODUCT  = `PD-${Date.now().toString(36).toUpperCase().slice(-6)}`;
const LOB      = 'CommercialAuto';
const JCODE    = 'NY';
const COV_CODE = 'BI';

const SHARED_POLICY_ID = (() => {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
})();

test.describe('Suite 20009 — Real Time Access to Policy and Risk Data', () => {

  useSuiteAnnotations('20009', '18163');

  const state = new StateManager('suite20009');

  // ══════════════════════════════════════════════════════════════════════════
  // SETUP — Rate Plan Lifecycle + Calculate Occurrence
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Setup — Lifecycle + Calculate', () => {

    test('Setup-01 Create and activate rate plan', async ({ request }) => {
      const rp  = new RatePlanService(request, RT_BASE);
      const vid = await rp.runLifecycle({
        name:             `PD-RP-${Date.now().toString(36).toUpperCase()}`,
        productCode:      PRODUCT,
        lineOfBusiness:   LOB,
        jurisdictionCode: JCODE,
        effectiveFrom:    '2026-01-01',
        effectiveTo:      '2028-12-31',
      });
      state.set('versionId', vid);
    });

    test('Setup-02 Calculate occurrence to get executionId', async ({ request }) => {
      expect(state.get('versionId'), 'versionId missing').toBeTruthy();
      const occ    = new OccurrenceService(request, RT_BASE);
      const result = await occ.calculate({
        versionId:      state.get('versionId'),
        coverageCode:   COV_CODE,
        stateCode:      JCODE,
        productCode:    PRODUCT,
        lineOfBusiness: LOB,
        effectiveDate:  '2026-01-02',
        expirationDate: '2028-12-31',
        baseExposure:   1.25,
        baseRate:       1200,
        policyId:       SHARED_POLICY_ID,
        tenantId:       TENANT,
        extensionAttributes: { productCode: PRODUCT, lineOfBusiness: LOB, jurisdictionCode: JCODE },
      });
      expect(result.resultId).toBeTruthy();
      state.set('executionId', result.resultId);
    });

  });

  // ══════════════════════════════════════════════════════════════════════════
  // SNAPSHOT  TC 20064–20068
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-PD-001] @TC20064 Verify GET /snapshot/{executionId} returns 200 with snapshot data',
    async ({ request }) => {
      expect(state.get('executionId'), 'executionId missing').toBeTruthy();
      const svc    = new PolicyDataService(request, RT_BASE);
      const result = await svc.getSnapshot(state.get('executionId'));
      expect(result.snapshotData).toBeTruthy();
      expect(result.latencyMs).toBeLessThan(2000);
      test.info().annotations.push({ type: 'Evidence', description: `latencyMs=${result.latencyMs}` });
    },
  );

  test('[TC-PD-002] @TC20065 Verify snapshot is immutable — two reads return identical JSON',
    async ({ request }) => {
      expect(state.get('executionId'), 'executionId missing').toBeTruthy();
      const svc = new PolicyDataService(request, RT_BASE);
      const r1  = await svc.getSnapshot(state.get('executionId'));
      const r2  = await svc.getSnapshot(state.get('executionId'));
      expect(JSON.stringify(r1.snapshotData)).toBe(JSON.stringify(r2.snapshotData));
    },
  );

  test('[TC-PD-003] @TC20066 Verify unknown executionId returns 404',
    async ({ request }) => {
      const svc = new PolicyDataService(request, RT_BASE);
      await expect(svc.getSnapshot('aaaabbbb-cccc-4ddd-8eee-ffffffffffff')).rejects.toThrow(/404/);
    },
  );

  test('[TC-PD-004] @TC20067 Verify snapshot response time is within 2 seconds',
    async ({ request }) => {
      expect(state.get('executionId'), 'executionId missing').toBeTruthy();
      const svc    = new PolicyDataService(request, RT_BASE);
      const result = await svc.getSnapshot(state.get('executionId'));
      expect(result.latencyMs).toBeLessThan(2000);
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS LOGS  TC 20069–20074
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-PD-005] @TC20069 Verify GET /accesslogs returns 200 for a valid policyId',
    async ({ request }) => {
      const svc  = new PolicyDataService(request, RT_BASE);
      const logs = await svc.getAccessLogs(SHARED_POLICY_ID);
      expect(Array.isArray(logs)).toBe(true);
      test.info().annotations.push({ type: 'Evidence', description: `logs.count=${logs.length}` });
    },
  );

  test('[TC-PD-006] @TC20070 Verify access log response time within 30 seconds',
    async ({ request }) => {
      const svc   = new PolicyDataService(request, RT_BASE);
      const start = Date.now();
      await svc.getAccessLogs(SHARED_POLICY_ID);
      expect(Date.now() - start).toBeLessThan(30_000);
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SEARCH  TC 20075–20078
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-PD-008] @TC20075 Verify /accesslogs/search with policyId filter returns 200',
    async ({ request }) => {
      const svc    = new PolicyDataService(request, RT_BASE);
      const result = await svc.searchAccessLogs({ policyId: SHARED_POLICY_ID });
      expect(Array.isArray(result)).toBe(true);
    },
  );

  test('[TC-PD-009] @TC20076 Verify search with date range returns 200',
    async ({ request }) => {
      const svc    = new PolicyDataService(request, RT_BASE);
      const result = await svc.searchAccessLogs({ fromDate: '2026-01-01', toDate: '2026-12-31' });
      expect(Array.isArray(result)).toBe(true);
    },
  );

  test('[TC-PD-010] @TC20077 Verify search without filters returns all accessible logs',
    async ({ request }) => {
      const svc    = new PolicyDataService(request, RT_BASE);
      const result = await svc.searchAccessLogs();
      expect(Array.isArray(result)).toBe(true);
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORT  TC 20079–20082
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-PD-011] @TC20079 Verify GET /accesslogs/export returns 200',
    async ({ request }) => {
      const svc    = new PolicyDataService(request, RT_BASE);
      const result = await svc.exportAccessLogs();
      expect(result.rawBody).toBeTruthy();
    },
  );

  test('[TC-PD-012] @TC20080 Verify export with date range filter returns 200',
    async ({ request }) => {
      const svc    = new PolicyDataService(request, RT_BASE);
      const result = await svc.exportAccessLogs({ fromDate: '2026-01-01', toDate: '2026-12-31' });
      expect(result.rawBody).toBeTruthy();
    },
  );

});
