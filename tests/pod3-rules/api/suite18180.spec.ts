// File: tests/pod3-rules/api/suite18180.spec.ts
// ADO Suite  : 18180
// ADO Plan   : 18163 — US-4.2 Separation of Rules from Application Code
//
// ─── Page Object Model ────────────────────────────────────────────────────────
// All HTTP calls go through RuleService — this file has ONLY test() blocks.
//
//   RuleService → /api/v1/rules (create / update / submit / approve / deploy / deployments)

import { test, expect, useSuiteAnnotations } from '@fixtures/tc-fixture';
import { RuleService }                        from '@services/rules/RuleService';
import { StateManager }                       from '@utils/StateManager';

const RULES_URL = (process.env['RULES_URL'] ?? '').replace(/\/$/, '');

test.describe('Suite 18180 — Separation of Rules from Application Code', () => {

  useSuiteAnnotations('18180', '18163');

  const state = new StateManager('suite18180');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — RULE DEPLOYMENT LIFECYCLE  (serial state chain)
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('DEPLOYMENT — Rule Deployment Lifecycle', () => {

    test('[TC-4.2-01] Verify creating a rule and advancing it to Active returns a deployable rule',
      async ({ request }) => {
        const svc  = new RuleService(request, RULES_URL);
        const ruleId = await svc.runLifecycle({
          executionPhase: 'BusinessValidation',
          context:        'Quote',
        });
        expect(ruleId).toBeTruthy();
        state.set('ruleId', ruleId);
        test.info().annotations.push({ type: 'Evidence', description: `ruleId=${ruleId}` });
      },
    );

    test('[TC-4.2-02] Verify deploying an Active rule returns 200/201 with deployment record',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing').toBeTruthy();
        const svc    = new RuleService(request, RULES_URL);
        const result = await svc.deploy(state.get('ruleId'), { environment: 'QA' });
        expect(result.id).toBeTruthy();
        state.set('deploymentId', result.id);
        test.info().annotations.push({ type: 'Evidence', description: `deploymentId=${result.id} env=${result.environment}` });
      },
    );

    test('[TC-4.2-03] Verify GET /deployments returns deployment history with at least one entry',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing').toBeTruthy();
        const svc    = new RuleService(request, RULES_URL);
        const result = await svc.getDeployments(state.get('ruleId'));
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThanOrEqual(1);
        test.info().annotations.push({ type: 'Evidence', description: `deployments.count=${result.length}` });
      },
    );

  }); // end serial deployment

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — UPDATE  TC 4.2-05–09
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-4.2-05] Verify updating a Draft rule body returns 200',
    async ({ request }) => {
      const svc  = new RuleService(request, RULES_URL);
      // Create a fresh draft for this test
      const rule = await svc.create({ executionPhase: 'BusinessValidation', context: 'Quote' });
      const upd  = await svc.update(rule.id, {
        ruleName:    `Updated-${rule.ruleName}`,
        description: 'Updated by suite18180 POM test',
      });
      expect(upd.id).toBe(rule.id);
      test.info().annotations.push({ type: 'Evidence', description: `id=${upd.id}` });
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — VALIDATION  TC 4.2-10–14
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-4.2-10] Verify deploying a Draft (non-Active) rule returns 400/422',
    async ({ request }) => {
      const svc  = new RuleService(request, RULES_URL);
      const rule = await svc.create({ executionPhase: 'BusinessValidation', context: 'Quote' });
      // Draft rule — deploy should fail
      await expect(svc.deploy(rule.id, { environment: 'QA' })).rejects.toThrow(/4\d\d/);
    },
  );

  test('[TC-4.2-11] Verify unknown rule id in deploy returns 404',
    async ({ request }) => {
      const svc = new RuleService(request, RULES_URL);
      await expect(svc.deploy('aaaabbbb-cccc-4ddd-8eee-ffffffffffff')).rejects.toThrow(/404/);
    },
  );

});
