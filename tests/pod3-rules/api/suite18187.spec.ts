// File: tests/pod3-rules/api/suite18187.spec.ts
// ADO Suite  : 18187
// ADO Plan   : 18163 — US-13.1 Base Premium Calculation
// TC Range   : 18201–18230
//
// ─── Page Object Model ────────────────────────────────────────────────────────
// All HTTP calls go through PricingService — this file has ONLY test() blocks.
//
//   PricingService → /api/v1/rulesengine/pricing (calculate / recalculate / results / trace)

import { test, expect, useSuiteAnnotations } from '@fixtures/tc-fixture';
import { PricingService }                     from '@services/rules/PricingService';
import { StateManager }                       from '@utils/StateManager';
import * as crypto                            from 'crypto';

const RULES_URL = (process.env['RULES_URL'] ?? '').replace(/\/$/, '');

const SHARED_POLICY_ID = (() => {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
})();

test.describe('Suite 18187 — Base Premium Calculation', () => {

  useSuiteAnnotations('18187', '18163');

  const state = new StateManager('suite18187');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — CALCULATE  TC 18201–18209  (serial state chain)
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('CALCULATE — Premium Calculation Lifecycle', () => {

    test('[TC-BP-001] @TC18201 Verify POST /pricing/calculate returns 200/201 with result_id and base_premium',
      async ({ request }) => {
        const svc    = new PricingService(request, RULES_URL);
        const result = await svc.calculate({ policyId: SHARED_POLICY_ID, coverageCode: 'BI' });
        expect(result.resultId).toBeTruthy();
        expect(result.basePremium).toBeGreaterThanOrEqual(0);
        state.set('resultId', result.resultId);
        state.set('coverageCode', 'BI');
        test.info().annotations.push({ type: 'Evidence', description: `resultId=${result.resultId} basePremium=${result.basePremium}` });
      },
    );

    test('[TC-BP-002] @TC18202 Verify final_premium = base_premium + modifiers + fees (±0.01)',
      async ({ request }) => {
        expect(state.get('resultId'), 'resultId missing — TC-BP-001 must complete').toBeTruthy();
        const svc    = new PricingService(request, RULES_URL);
        const result = await svc.getByPolicy(SHARED_POLICY_ID);
        const latest = result.find(r => r.resultId === state.get('resultId'));
        if (latest) {
          const computed = latest.basePremium + latest.totalModifiers + latest.totalFees;
          expect(Math.abs(computed - latest.finalPremium)).toBeLessThanOrEqual(0.01);
          test.info().annotations.push({ type: 'Evidence', description: `finalPremium=${latest.finalPremium} computed=${computed}` });
        }
      },
    );

    test('[TC-BP-003] @TC18203 Verify POST /pricing/recalculate returns new result_id, old is superseded',
      async ({ request }) => {
        expect(state.get('resultId'), 'resultId missing').toBeTruthy();
        const svc    = new PricingService(request, RULES_URL);
        const result = await svc.recalculate({ policyId: SHARED_POLICY_ID, coverageCode: 'BI' });
        expect(result.resultId).toBeTruthy();
        expect(result.resultId).not.toBe(state.get('resultId'));
        state.set('resultIdR2', result.resultId);
        test.info().annotations.push({ type: 'Evidence', description: `newResultId=${result.resultId}` });
      },
    );

    test('[TC-BP-004] @TC18204 Verify old result is superseded after recalculate',
      async ({ request }) => {
        expect(state.get('resultId'), 'resultId missing').toBeTruthy();
        const svc     = new PricingService(request, RULES_URL);
        const results = await svc.getByPolicy(SHARED_POLICY_ID);
        const old     = results.find(r => r.resultId === state.get('resultId'));
        if (old) {
          expect(old.isSuperseded).toBe(true);
          test.info().annotations.push({ type: 'Evidence', description: `resultId=${state.get('resultId')} isSuperseded=${old.isSuperseded}` });
        }
      },
    );

    test('[TC-BP-005] @TC18205 Verify GET /results/{policyId} returns history list with both results',
      async ({ request }) => {
        expect(state.get('resultId'), 'resultId missing').toBeTruthy();
        const svc     = new PricingService(request, RULES_URL);
        const results = await svc.getByPolicy(SHARED_POLICY_ID);
        expect(results.length).toBeGreaterThanOrEqual(2);
        const ids = results.map(r => r.resultId);
        expect(ids).toContain(state.get('resultId'));
        test.info().annotations.push({ type: 'Evidence', description: `historyCount=${results.length}` });
      },
    );

    test('[TC-BP-006] @TC18206 Verify GET /results/{policyId}/{coverageCode}/latest returns latest non-superseded result',
      async ({ request }) => {
        const svc    = new PricingService(request, RULES_URL);
        const result = await svc.getLatest(SHARED_POLICY_ID, 'BI');
        expect(result.resultId).toBeTruthy();
        expect(result.isSuperseded).toBe(false);
        test.info().annotations.push({ type: 'Evidence', description: `latestResultId=${result.resultId}` });
      },
    );

    test('[TC-BP-007] @TC18207 Verify GET /results/{resultId}/trace returns execution trace',
      async ({ request }) => {
        expect(state.get('resultId'), 'resultId missing').toBeTruthy();
        const svc    = new PricingService(request, RULES_URL);
        const result = await svc.getTrace(state.get('resultId'));
        expect(result.resultId).toBeTruthy();
        expect(typeof result.executionMs).toBe('number');
        test.info().annotations.push({ type: 'Evidence', description: `traceResultId=${result.resultId} executionMs=${result.executionMs}` });
      },
    );

  }); // end serial

  // ══════════════════════════════════════════════════════════════════════════
  // LINE ITEMS  TC 18208–18215
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-BP-008] @TC18208 Verify line items have itemType matching rule code prefix convention',
    async ({ request }) => {
      const svc    = new PricingService(request, RULES_URL);
      const result = await svc.calculate({ policyId: SHARED_POLICY_ID, coverageCode: 'BI' });
      const valid  = ['RATE', 'MOD', 'DISC', 'FEE', 'TAX', 'SURCH'];
      for (const item of result.lineItems) {
        expect(valid.some(prefix => item.ruleCode.startsWith(prefix) || valid.includes(item.itemType)))
          .toBe(true);
      }
    },
  );

  test('[TC-BP-009] @TC18209 Verify modifier line items have ascending sequence_order',
    async ({ request }) => {
      const svc    = new PricingService(request, RULES_URL);
      const result = await svc.calculate({ policyId: SHARED_POLICY_ID, coverageCode: 'BI' });
      const mods   = result.lineItems.filter(i => i.itemType === 'MOD' || i.ruleCode.startsWith('MOD_'));
      for (let i = 1; i < mods.length; i++) {
        expect(mods[i].sequenceOrder).toBeGreaterThanOrEqual(mods[i - 1].sequenceOrder);
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION — Negative  TC 18210–18215
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-BP-NEG-001] @TC18210 Verify missing policyId returns 400/422',
    async ({ request }) => {
      const svc = new PricingService(request, RULES_URL);
      await expect(svc.calculate({ policyId: '', coverageCode: 'BI' })).rejects.toThrow(/4\d\d/);
    },
  );

  test('[TC-BP-NEG-002] @TC18211 Verify unknown policyId in /latest returns 404',
    async ({ request }) => {
      const svc = new PricingService(request, RULES_URL);
      await expect(svc.getLatest('aaaabbbb-cccc-4ddd-8eee-ffffffffffff', 'BI')).rejects.toThrow(/404/);
    },
  );

  test('[TC-BP-NEG-003] @TC18212 Verify superseded results still return 200 from history (not 404)',
    async ({ request }) => {
      expect(state.get('resultId'), 'resultId missing').toBeTruthy();
      const svc     = new PricingService(request, RULES_URL);
      const results = await svc.getByPolicy(SHARED_POLICY_ID);
      const old     = results.find(r => r.resultId === state.get('resultId'));
      // Superseded result must still be accessible (auditability)
      expect(old).toBeDefined();
    },
  );

});
