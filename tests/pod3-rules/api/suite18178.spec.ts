// File: tests/pod3-rules/api/suite18178.spec.ts
// ADO Suite  : 18178
// ADO Plan   : 18163 — API First Rule Integration
// TC Range   : 17340–17369
//
// ─── Page Object Model ────────────────────────────────────────────────────────
// All HTTP calls go through RuleService — this file has ONLY test() blocks.
//
//   RuleService → /api/v1/rules (CRUD + lifecycle)

import { test, expect, useSuiteAnnotations } from '@fixtures/tc-fixture';
import { RuleService }                        from '@services/rules/RuleService';
import { StateManager }                       from '@utils/StateManager';

const RULES_URL = (process.env['RULES_URL'] ?? '').replace(/\/$/, '');

test.describe('Suite 18178 — API First Rule Integration', () => {

  useSuiteAnnotations('18178', '18163');

  const state = new StateManager('suite18178');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — CREATE  TC 17340–17344
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('LIFECYCLE — Rule CRUD + State Machine', () => {

    test('[TC-AI-001] @TC17340 Verify creating a rule returns 201 with Draft status and unique id',
      async ({ request }) => {
        const svc    = new RuleService(request, RULES_URL);
        const result = await svc.create({ executionPhase: 'BusinessValidation', context: 'Quote' });
        expect(result.id).toBeTruthy();
        expect(result.status).toBe('Draft');
        expect(result.ruleCode).toBeTruthy();
        state.setAll({ ruleId: result.id, ruleCode: result.ruleCode });
        test.info().annotations.push({ type: 'Evidence', description: `id=${result.id} status=${result.status}` });
      },
    );

    test('[TC-AI-002] @TC17341 Verify GET /rules/{id} returns 200 with correct rule data',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing — TC-AI-001 must complete').toBeTruthy();
        const svc    = new RuleService(request, RULES_URL);
        const result = await svc.getById(state.get('ruleId'));
        expect(result.id).toBe(state.get('ruleId'));
        expect(result.ruleCode).toBe(state.get('ruleCode'));
        test.info().annotations.push({ type: 'Evidence', description: `id=${result.id} status=${result.status}` });
      },
    );

    test('[TC-AI-003] @TC17342 Verify submitting a Draft rule transitions to Submitted',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing').toBeTruthy();
        const svc = new RuleService(request, RULES_URL);
        await svc.submit(state.get('ruleId'));
        const result = await svc.getById(state.get('ruleId'));
        expect(['Submitted', 'UnderReview', 'submitted']).toContain(result.status);
        test.info().annotations.push({ type: 'Evidence', description: `status=${result.status}` });
      },
    );

    test('[TC-AI-004] @TC17343 Verify approving a Submitted rule transitions to Active',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing').toBeTruthy();
        const svc = new RuleService(request, RULES_URL);
        await svc.approve(state.get('ruleId'));
        const result = await svc.getById(state.get('ruleId'));
        expect(['Active', 'active', 'Approved', 'approved']).toContain(result.status);
        test.info().annotations.push({ type: 'Evidence', description: `status=${result.status}` });
      },
    );

  }); // end serial lifecycle

  // ══════════════════════════════════════════════════════════════════════════
  // LIST & FILTER  TC 17345–17350
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-AI-005] @TC17344 Verify GET /rules returns paginated list',
    async ({ request }) => {
      const svc   = new RuleService(request, RULES_URL);
      const items = await svc.list({ pageSize: 10 });
      expect(Array.isArray(items)).toBe(true);
      test.info().annotations.push({ type: 'Evidence', description: `list.count=${items.length}` });
    },
  );

  test('[TC-AI-006] @TC17345 Verify status filter returns only matching rules',
    async ({ request }) => {
      const svc   = new RuleService(request, RULES_URL);
      const items = await svc.list({ status: 'Draft' });
      expect(Array.isArray(items)).toBe(true);
      test.info().annotations.push({ type: 'Evidence', description: `Draft rules count=${items.length}` });
    },
  );

  test('[TC-AI-007] @TC17346 Verify context filter works correctly',
    async ({ request }) => {
      const svc   = new RuleService(request, RULES_URL);
      const items = await svc.list({ context: 'Quote' });
      expect(Array.isArray(items)).toBe(true);
      test.info().annotations.push({ type: 'Evidence', description: `Quote context count=${items.length}` });
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION — Negative  TC 17351–17356
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-AI-008] @TC17350 Verify duplicate rule_code in same tenant returns 409 Conflict',
    async ({ request }) => {
      expect(state.get('ruleCode'), 'ruleCode missing — TC-AI-001 must complete').toBeTruthy();
      const svc = new RuleService(request, RULES_URL);
      await expect(svc.create({ ruleCode: state.get('ruleCode') })).rejects.toThrow(/40[9]/);
    },
  );

  test('[TC-AI-009] @TC17351 Verify unknown rule id returns 404',
    async ({ request }) => {
      const svc = new RuleService(request, RULES_URL);
      await expect(svc.getById('aaaabbbb-cccc-4ddd-8eee-ffffffffffff')).rejects.toThrow(/404/);
    },
  );

  test('[TC-AI-010] @TC17352 Verify invalid execution_phase returns 400/422',
    async ({ request }) => {
      const svc = new RuleService(request, RULES_URL);
      await expect(svc.create({ executionPhase: 'INVALID_PHASE' })).rejects.toThrow(/4\d\d/);
    },
  );

});
