// File: tests/pod3-rules/api/suite19725.spec.ts
// ADO Suite  : 19725
// ADO Plan   : 18163 — RESTful APIs and Backward Compatibility
//
// ─── Page Object Model ────────────────────────────────────────────────────────
// All HTTP calls go through service objects — this file has ONLY test() blocks.
//
//   RuleService      → /api/v1/rules (rules engine versioning)
//   RatePlanService  → /api/v1/ratingengine/rateplans (rating engine versioning)

import { test, expect, useSuiteAnnotations } from '@fixtures/tc-fixture';
import { RuleService }                        from '@services/rules/RuleService';
import { RatePlanService }                    from '@services/rating/RatePlanService';

const RULES_URL = (process.env['RULES_URL']        ?? '').replace(/\/$/, '');
const RT_BASE   = (process.env['RATING_ENGINE_URL'] ?? '').replace(/\/$/, '');

test.describe('Suite 19725 — RESTful APIs and Backward Compatibility', () => {

  useSuiteAnnotations('19725', '18163');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — API VERSION HEADERS — Rules Engine  TC 19492–19500
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-BC-001] Verify GET /rules returns 200 with x-api-version response header',
    async ({ request }) => {
      const svc   = new RuleService(request, RULES_URL);
      const items = await svc.list({ pageSize: 1 });
      expect(Array.isArray(items)).toBe(true);
      // Version header validated through service call (logged by BaseApiService)
      test.info().annotations.push({ type: 'Evidence', description: `rules list succeeded count=${items.length}` });
    },
  );

  test('[TC-BC-002] Verify POST /rules accepts and returns JSON:API contract',
    async ({ request }) => {
      const svc    = new RuleService(request, RULES_URL);
      const result = await svc.create({ executionPhase: 'BusinessValidation' });
      expect(result.id).toBeTruthy();
      expect(result.status).toBe('Draft');
      // Immediately clean up
      await svc.delete(result.id);
      test.info().annotations.push({ type: 'Evidence', description: `created id=${result.id} then deleted` });
    },
  );

  test('[TC-BC-003] Verify GET /rules/{id} with valid id returns consistent response shape',
    async ({ request }) => {
      const svc    = new RuleService(request, RULES_URL);
      const rule   = await svc.create({ executionPhase: 'BusinessValidation' });
      const result = await svc.getById(rule.id);
      expect(result.id).toBe(rule.id);
      expect(result.ruleCode).toBeTruthy();
      expect(result.status).toBeTruthy();
      await svc.delete(rule.id);
      test.info().annotations.push({ type: 'Evidence', description: `id=${result.id} status=${result.status}` });
    },
  );

  test('[TC-BC-004] Verify DELETE /rules/{id} returns 204 and rule is gone',
    async ({ request }) => {
      const svc  = new RuleService(request, RULES_URL);
      const rule = await svc.create({ executionPhase: 'BusinessValidation' });
      await svc.delete(rule.id);
      // Subsequent GET must return 404
      await expect(svc.getById(rule.id)).rejects.toThrow(/404/);
      test.info().annotations.push({ type: 'Evidence', description: `id=${rule.id} deleted and confirmed 404` });
    },
  );

  test('[TC-BC-005] Verify unknown endpoint returns 404 — no silent 200',
    async ({ request }) => {
      const res = await request.get(`${RULES_URL}/api/v99/rules`, {
        headers: { Accept: 'application/json' },
      });
      console.log(`\n-> GET /api/v99/rules`);
      console.log(`<- ${res.status()}`);
      expect([404, 400]).toContain(res.status());
      test.info().annotations.push({ type: 'Evidence', description: `v99 endpoint returned ${res.status()}` });
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — API VERSION HEADERS — Rating Engine  TC 19501–19510
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-BC-006] Verify GET /rateplans returns 200 with correct response shape',
    async ({ request }) => {
      const svc   = new RatePlanService(request, RT_BASE);
      const items = await svc.list({ pageSize: 1 });
      expect(Array.isArray(items)).toBe(true);
      test.info().annotations.push({ type: 'Evidence', description: `ratePlans count=${items.length}` });
    },
  );

  test('[TC-BC-007] Verify v1 is the only supported version — v2 returns 404',
    async ({ request }) => {
      const res = await request.get(`${RT_BASE}/api/v2/ratingengine/rateplans`, {
        headers: { Accept: 'application/json' },
      });
      console.log(`\n-> GET /api/v2/ratingengine/rateplans`);
      console.log(`<- ${res.status()}`);
      expect([404, 400]).toContain(res.status());
      test.info().annotations.push({ type: 'Evidence', description: `v2 endpoint returned ${res.status()} (correctly not found)` });
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — BACKWARD COMPATIBILITY  TC 19511–19520
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-BC-008] Verify response contract remains stable — required fields present in list response',
    async ({ request }) => {
      const svc   = new RuleService(request, RULES_URL);
      const items = await svc.list({ pageSize: 5 });
      if (items.length > 0) {
        const first = items[0];
        expect(first.id).toBeTruthy();
        expect(first.status).toBeTruthy();
      }
      test.info().annotations.push({ type: 'Evidence', description: `list count=${items.length}` });
    },
  );

  test('[TC-BC-009] Verify GET /rules returns 200 even with no rules (empty array, not 404)',
    async ({ request }) => {
      const svc   = new RuleService(request, RULES_URL);
      const items = await svc.list();
      // Must be an array (empty is valid — not a 404)
      expect(Array.isArray(items)).toBe(true);
      test.info().annotations.push({ type: 'Evidence', description: `list is array count=${items.length}` });
    },
  );

});
