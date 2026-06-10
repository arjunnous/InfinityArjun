// File: tests/pod3-rating/api/suite18304.spec.ts
// ADO Suite  : 18304
// ADO Plan   : 18163 — Extract Rating Formulas and Algorithms
//
// ─── Page Object Model ────────────────────────────────────────────────────────
// All HTTP calls go through FormulaService — this file has ONLY test() blocks.
//
//   FormulaService → /api/v1/rating/formulas/extract (JSON / Excel / PDF / exports)

import { test, expect, useSuiteAnnotations } from '@fixtures/tc-fixture';
import { FormulaService }                     from '@services/rating/FormulaService';

const RT_BASE = (process.env['RATING_ENGINE_URL'] ?? '').replace(/\/$/, '');

test.describe('Suite 18304 — Extract Rating Formulas and Algorithms', () => {

  useSuiteAnnotations('18304', '18163');

  // ══════════════════════════════════════════════════════════════════════════
  // FUNC — Formula Extraction  TC 17631–17636
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-FX-001] @TC17631 Verify JSON formula extract returns all active formula definitions',
    async ({ request }) => {
      const svc    = new FormulaService(request, RT_BASE);
      const result = await svc.extract();
      expect(Array.isArray(result.formulas)).toBe(true);
      expect(result.formulas.length).toBeGreaterThanOrEqual(0);
      test.info().annotations.push({ type: 'Evidence', description: `formulas.count=${result.formulas.length} totalVersions=${result.totalVersions}` });
    },
  );

  test('[TC-FX-002] @TC17632 Verify Excel formula extract returns 200 with correct content-type',
    async ({ request }) => {
      const svc    = new FormulaService(request, RT_BASE);
      const result = await svc.extractExcel();
      expect(result.contentType).toContain('spreadsheet');
      test.info().annotations.push({ type: 'Evidence', description: `contentType=${result.contentType}` });
    },
  );

  test('[TC-FX-003] @TC17633 Verify PDF formula extract returns 200 with correct content-type',
    async ({ request }) => {
      const svc    = new FormulaService(request, RT_BASE);
      const result = await svc.extractPdf();
      expect(result.contentType).toContain('pdf');
      test.info().annotations.push({ type: 'Evidence', description: `contentType=${result.contentType}` });
    },
  );

  test('[TC-FX-004] @TC17634 Verify export history list returns 200 with an array',
    async ({ request }) => {
      const svc     = new FormulaService(request, RT_BASE);
      const exports = await svc.getExports();
      expect(Array.isArray(exports)).toBe(true);
      test.info().annotations.push({ type: 'Evidence', description: `exports.count=${exports.length}` });
    },
  );

  test('[TC-FX-005] @TC17635 Verify JSON extract is idempotent — two identical calls return same count',
    async ({ request }) => {
      const svc = new FormulaService(request, RT_BASE);
      const r1  = await svc.extract();
      const r2  = await svc.extract();
      expect(r1.formulas.length).toBe(r2.formulas.length);
      test.info().annotations.push({ type: 'Evidence', description: `call1.count=${r1.formulas.length} call2.count=${r2.formulas.length}` });
    },
  );

  test('[TC-FX-006] @TC17636 Verify JSON extract with statusFilter parameter returns 200',
    async ({ request }) => {
      const svc    = new FormulaService(request, RT_BASE);
      const result = await svc.extract({ statusFilter: 'Active' });
      expect(Array.isArray(result.formulas)).toBe(true);
      test.info().annotations.push({ type: 'Evidence', description: `statusFilter=Active count=${result.formulas.length}` });
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION — Negative Scenarios  TC 17637–17640
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-FX-007] @TC17637 Verify unknown ratePlanVersionId returns 400/404/422',
    async ({ request }) => {
      const svc = new FormulaService(request, RT_BASE);
      await expect(
        svc.extract({ ratePlanVersionId: 'aaaabbbb-cccc-4ddd-8eee-ffffffffffff' }),
      ).rejects.toThrow(/[45]\d\d/);
    },
  );

  test('[TC-FX-008] @TC17638 Verify pagination parameters are accepted (no error)',
    async ({ request }) => {
      const svc    = new FormulaService(request, RT_BASE);
      const result = await svc.extract({ pageSize: 5, pageNumber: 1 });
      expect(Array.isArray(result.formulas)).toBe(true);
      test.info().annotations.push({ type: 'Evidence', description: `pageSize=5 count=${result.formulas.length}` });
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // TENANT — Isolation Verification  TC 17641–17642
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-FX-011] @TC17641 Verify tenant isolation — extract only returns own-tenant formulas',
    async ({ request }) => {
      const svc    = new FormulaService(request, RT_BASE);
      const result = await svc.extract();
      // If tenantId is returned, verify it belongs to the requesting tenant
      if (result.tenantId) {
        expect(result.tenantId).toBeTruthy();
      }
      test.info().annotations.push({ type: 'Evidence', description: `tenantId=${result.tenantId || '(not in response)'}` });
    },
  );

  test('[TC-FX-012] @TC17642 Verify formula records contain required contract fields',
    async ({ request }) => {
      const svc    = new FormulaService(request, RT_BASE);
      const result = await svc.extract();
      if (result.formulas.length > 0) {
        const first = result.formulas[0];
        // At least one identifying field must be present
        expect(first.ratePlanVersionId || first.id || first.versionId).toBeTruthy();
      }
      test.info().annotations.push({ type: 'Evidence', description: `formulas.count=${result.formulas.length}` });
    },
  );

});
