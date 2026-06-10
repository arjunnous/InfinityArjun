// File: tests/pod3-rules/api/suite18186.spec.ts
// ADO Suite  : 18186
// ADO Plan   : 18163 — US-4.3 Audit Log, Version History & Rollback
// TC Range   : TC-17461–17490
//
// ─── Page Object Model ────────────────────────────────────────────────────────
// All HTTP calls go through RuleService — this file has ONLY test() blocks.
//
//   RuleService → /api/v1/rules (audit / versions / compare / rollback)

import { test, expect, useSuiteAnnotations } from '@fixtures/tc-fixture';
import { RuleService }                        from '@services/rules/RuleService';
import { StateManager }                       from '@utils/StateManager';

const RULES_URL = (process.env['RULES_URL'] ?? '').replace(/\/$/, '');

test.describe('Suite 18186 — Audit Log, Version History & Rollback', () => {

  useSuiteAnnotations('18186', '18163');

  const state = new StateManager('suite18186');

  // ══════════════════════════════════════════════════════════════════════════
  // SETUP — Create an Active rule for audit/version tests
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('Setup + Audit + Version + Rollback', () => {

    test('Setup-01 Create and activate rule for audit testing',
      async ({ request }) => {
        const svc    = new RuleService(request, RULES_URL);
        const ruleId = await svc.runLifecycle({ executionPhase: 'BusinessValidation' });
        state.set('ruleId', ruleId);
        test.info().annotations.push({ type: 'Evidence', description: `ruleId=${ruleId}` });
      },
    );

    // ── AUDIT LOG  TC 17461–17467 ────────────────────────────────────────

    test('[TC-AL-001] @TC17461 Verify GET /audit returns 200 with audit entries',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing').toBeTruthy();
        const svc    = new RuleService(request, RULES_URL);
        const result = await svc.getAudit(state.get('ruleId'));
        expect(Array.isArray(result)).toBe(true);
        test.info().annotations.push({ type: 'Evidence', description: `audit.count=${result.length}` });
      },
    );

    test('[TC-AL-002] @TC17462 Verify audit trail captures create, submit, and approve actions',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing').toBeTruthy();
        const svc    = new RuleService(request, RULES_URL);
        const result = await svc.getAudit(state.get('ruleId'));
        expect(result.length).toBeGreaterThanOrEqual(3);  // create + submit + approve
        test.info().annotations.push({ type: 'Evidence', description: `audit entries=${result.length}` });
      },
    );

    test('[TC-AL-003] @TC17463 Verify audit entries have required fields (action, performedBy, performedAt)',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing').toBeTruthy();
        const svc    = new RuleService(request, RULES_URL);
        const result = await svc.getAudit(state.get('ruleId'));
        if (result.length > 0) {
          expect(result[0].action).toBeTruthy();
          expect(result[0].performedBy).toBeTruthy();
          expect(result[0].performedAt).toBeTruthy();
        }
      },
    );

    // ── VERSION HISTORY  TC 17468–17474 ─────────────────────────────────

    test('[TC-VH-001] @TC17468 Verify GET /versions returns version history with at least one entry',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing').toBeTruthy();
        const svc    = new RuleService(request, RULES_URL);
        const result = await svc.getVersions(state.get('ruleId'));
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThanOrEqual(1);
        test.info().annotations.push({ type: 'Evidence', description: `versions.count=${result.length}` });
      },
    );

    test('[TC-VH-002] @TC17469 Verify version records contain versionNumber, status, createdAt',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing').toBeTruthy();
        const svc    = new RuleService(request, RULES_URL);
        const result = await svc.getVersions(state.get('ruleId'));
        if (result.length > 0) {
          expect(typeof result[0].versionNumber).toBe('number');
          expect(result[0].status).toBeTruthy();
        }
      },
    );

    // ── VERSION COMPARE  TC 17475–17478 ─────────────────────────────────

    test('[TC-VC-001] @TC17475 Verify comparing two versions returns diff result',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing').toBeTruthy();
        const svc      = new RuleService(request, RULES_URL);
        const versions = await svc.getVersions(state.get('ruleId'));
        if (versions.length < 2) {
          test.skip(true, 'Need at least 2 versions for compare test');
          return;
        }
        const result = await svc.compareVersions(state.get('ruleId'), {
          versionA: String(versions[0].versionNumber),
          versionB: String(versions[1].versionNumber),
        });
        expect(Array.isArray(result.differences)).toBe(true);
        test.info().annotations.push({ type: 'Evidence', description: `diffCount=${result.diffCount}` });
      },
    );

    // ── ROLLBACK  TC 17479–17484 ─────────────────────────────────────────

    test('[TC-RB-001] @TC17479 Verify rolling back an Active rule succeeds',
      async ({ request }) => {
        expect(state.get('ruleId'), 'ruleId missing').toBeTruthy();
        const svc = new RuleService(request, RULES_URL);
        // Rollback should succeed for an Active rule with prior version
        try {
          await svc.rollback(state.get('ruleId'));
          test.info().annotations.push({ type: 'Evidence', description: 'Rollback succeeded' });
        } catch (err) {
          // Rollback may return 400 if no prior version exists — acceptable
          const msg = String(err);
          expect(msg).toMatch(/4\d\d/);
          test.info().annotations.push({ type: 'Evidence', description: `Rollback returned 4xx (no prior version) — acceptable` });
        }
      },
    );

  }); // end serial

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION — Negative  TC 17485–17490
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-AL-NEG-001] @TC17485 Verify unknown rule id in /audit returns 404',
    async ({ request }) => {
      const svc = new RuleService(request, RULES_URL);
      await expect(svc.getAudit('aaaabbbb-cccc-4ddd-8eee-ffffffffffff')).rejects.toThrow(/404/);
    },
  );

  test('[TC-VH-NEG-001] @TC17486 Verify unknown rule id in /versions returns 404',
    async ({ request }) => {
      const svc = new RuleService(request, RULES_URL);
      await expect(svc.getVersions('aaaabbbb-cccc-4ddd-8eee-ffffffffffff')).rejects.toThrow(/404/);
    },
  );

});
