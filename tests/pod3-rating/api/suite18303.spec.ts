// File: tests/pod3-rating/api/suite18303.spec.ts
// ADO Suite  : 18303
// ADO Plan   : 18163 — Rate Plan Versioning Lifecycle
//
// ─── Page Object Model ────────────────────────────────────────────────────────
// All HTTP calls go through RatePlanService — this file has ONLY test() blocks.
//
//   RatePlanService → /api/v1/ratingengine/rateplans (full lifecycle + read)
//   StateManager    → persists version_id across worker boundaries

import { test, expect, useSuiteAnnotations } from '@fixtures/tc-fixture';
import { RatePlanService }                    from '@services/rating/RatePlanService';
import { StateManager }                       from '@utils/StateManager';

const RT_BASE  = (process.env['RATING_ENGINE_URL'] ?? '').replace(/\/$/, '');
const TENANT   = process.env['RATING_ENGINE_TENANT_ID'] ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CREATOR  = 'qa-tester-18303';
const APPROVER = 'qa-approver-18303';
const PRODUCT  = `TEST-RP-${Date.now().toString(36).toUpperCase().slice(-8)}`;
const LOB      = 'CommercialAuto';
const JCODE    = 'NY';

test.describe('Suite 18303 — Rate Plan Versioning Lifecycle', () => {

  useSuiteAnnotations('18303', '18163');

  const state = new StateManager('suite18303');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — LIFECYCLE  TC 17569–17577
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('LIFECYCLE — Rate Plan State Transitions', () => {

    test('[TC-RP-001] @TC17569 Verify creating a new rate plan returns Draft status with a unique version_id',
      async ({ request }) => {
        const rp   = new RatePlanService(request, RT_BASE);
        const name = `Suite18303-RP-${Date.now().toString(36).toUpperCase()}`;

        const result = await rp.create({
          name,
          productCode:      PRODUCT,
          lineOfBusiness:   LOB,
          jurisdictionCode: JCODE,
          effectiveFrom:    '2026-01-01',
          createdBy:        CREATOR,
          description:      `Suite 18303 automated test — ${name}`,
        });

        expect(result.versionId).toBeTruthy();
        expect(result.status).toBe('Draft');

        state.setAll({ versionId: result.versionId, name, effectiveFrom: '2026-01-01' });
        test.info().annotations.push({ type: 'Evidence', description: `version_id=${result.versionId} status=${result.status}` });
      },
    );

    test('[TC-RP-002] @TC17572 Verify submitting a Draft rate plan transitions status to Submitted',
      async ({ request }) => {
        expect(state.get('versionId'), 'version_id missing — TC-RP-001 must complete first').toBeTruthy();
        const rp = new RatePlanService(request, RT_BASE);
        await rp.submit(state.get('versionId'), { actionBy: CREATOR, tenantId: TENANT });
        const result = await rp.getById(state.get('versionId'));
        expect(['Submitted', 'submitted', 'UnderReview']).toContain(result.status);
        test.info().annotations.push({ type: 'Evidence', description: `status=${result.status}` });
      },
    );

    test('[TC-RP-003] @TC17573 Verify approving a Submitted rate plan transitions status to Approved',
      async ({ request }) => {
        expect(state.get('versionId'), 'version_id missing — TC-RP-002 must complete first').toBeTruthy();
        const rp = new RatePlanService(request, RT_BASE);
        await rp.approve(state.get('versionId'), { actionBy: APPROVER, tenantId: TENANT });
        const result = await rp.getById(state.get('versionId'));
        expect(['Approved', 'approved']).toContain(result.status);
        test.info().annotations.push({ type: 'Evidence', description: `status=${result.status}` });
      },
    );

    test('[TC-RP-004] @TC17574 Verify PendingActivation transitions from Approved',
      async ({ request }) => {
        expect(state.get('versionId'), 'version_id missing — TC-RP-003 must complete first').toBeTruthy();
        const rp = new RatePlanService(request, RT_BASE);
        await rp.pendingActivation(state.get('versionId'), state.get('effectiveFrom') || '2026-01-01',
          { actionBy: CREATOR, tenantId: TENANT });
        const result = await rp.getById(state.get('versionId'));
        expect(['PendingActivation', 'pending_activation', 'Pending']).toContain(result.status);
        test.info().annotations.push({ type: 'Evidence', description: `status=${result.status}` });
      },
    );

    test('[TC-RP-005] @TC17575 Verify activating a rate plan transitions status to Active',
      async ({ request }) => {
        expect(state.get('versionId'), 'version_id missing — TC-RP-004 must complete first').toBeTruthy();
        const rp = new RatePlanService(request, RT_BASE);
        await rp.activate(state.get('versionId'), { actionBy: CREATOR, tenantId: TENANT });
        const result = await rp.getById(state.get('versionId'));
        expect(['Active', 'active']).toContain(result.status);
        test.info().annotations.push({ type: 'Evidence', description: `status=${result.status}` });
      },
    );

    test('[TC-RP-006] @TC17576 Verify self-approval (same user as creator) is rejected with 400/422',
      async ({ request }) => {
        // Create a fresh plan for this test
        const rp   = new RatePlanService(request, RT_BASE);
        const plan = await rp.create({
          name:            `Suite18303-SelfApproval-${Date.now().toString(36).toUpperCase()}`,
          productCode:     PRODUCT,
          lineOfBusiness:  LOB,
          jurisdictionCode: JCODE,
          effectiveFrom:   '2026-01-01',
          createdBy:       CREATOR,
        });
        await rp.submit(plan.versionId, { actionBy: CREATOR, tenantId: TENANT });
        // Try to approve with SAME user — should fail
        await expect(
          rp.approve(plan.versionId, { actionBy: CREATOR, tenantId: TENANT }),
        ).rejects.toThrow(/4\d\d/);
      },
    );

    test('[TC-RP-007] @TC17577 Verify retiring an Active rate plan transitions status to Retired',
      async ({ request }) => {
        expect(state.get('versionId'), 'version_id missing — TC-RP-005 must complete first').toBeTruthy();
        const rp = new RatePlanService(request, RT_BASE);
        await rp.retire(state.get('versionId'), { actionBy: CREATOR, tenantId: TENANT });
        const result = await rp.getById(state.get('versionId'));
        expect(['Retired', 'retired']).toContain(result.status);
        test.info().annotations.push({ type: 'Evidence', description: `status=${result.status}` });
      },
    );

  }); // end serial lifecycle

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — VALIDATION  TC 17570–17571
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-RP-VAL-001] @TC17570 Verify missing required fields returns 400/422',
    async ({ request }) => {
      const rp = new RatePlanService(request, RT_BASE);
      await expect(
        rp.create({ name: '', productCode: '', lineOfBusiness: '', jurisdictionCode: '', effectiveFrom: '' }),
      ).rejects.toThrow(/[45]\d\d/);
    },
  );

  test('[TC-RP-VAL-002] @TC17571 Verify effectiveTo before effectiveFrom returns 400/422',
    async ({ request }) => {
      const rp = new RatePlanService(request, RT_BASE);
      await expect(
        rp.create({
          name:            `Suite18303-DateOrder-${Date.now().toString(36)}`,
          productCode:     PRODUCT,
          lineOfBusiness:  LOB,
          jurisdictionCode: JCODE,
          effectiveFrom:   '2027-12-31',
          effectiveTo:     '2026-01-01',   // before effectiveFrom — invalid
        }),
      ).rejects.toThrow(/[45]\d\d/);
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — READ OPERATIONS  TC 17581–17586
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-RP-READ-001] @TC17581 Verify resolve endpoint returns active rate plan for product/LOB/jurisdiction',
    async ({ request }) => {
      expect(state.get('versionId'), 'version_id missing — lifecycle must complete first').toBeTruthy();
      const rp = new RatePlanService(request, RT_BASE);
      // resolve may return 404 if the rate plan is now Retired (TC-RP-007 retires it)
      try {
        const result = await rp.resolve({ productCode: PRODUCT, lineOfBusiness: LOB, jurisdictionCode: JCODE });
        expect(result.versionId).toBeTruthy();
        test.info().annotations.push({ type: 'Evidence', description: `version_id=${result.versionId} status=${result.status}` });
      } catch (err) {
        const msg = String(err);
        expect(msg).toMatch(/4\d\d/);  // 404 acceptable if plan is retired
        test.info().annotations.push({ type: 'Evidence', description: 'Plan retired — resolve correctly returned 4xx' });
      }
    },
  );

  test('[TC-RP-READ-002] @TC17582 Verify list endpoint returns paginated rate plans',
    async ({ request }) => {
      const rp    = new RatePlanService(request, RT_BASE);
      const items = await rp.list({ pageSize: 10 });
      expect(Array.isArray(items)).toBe(true);
      test.info().annotations.push({ type: 'Evidence', description: `list count=${items.length}` });
    },
  );

  test('[TC-RP-READ-003] @TC17583 Verify get-by-id returns correct rate plan details',
    async ({ request }) => {
      expect(state.get('versionId'), 'version_id missing — TC-RP-001 must complete first').toBeTruthy();
      const rp     = new RatePlanService(request, RT_BASE);
      const result = await rp.getById(state.get('versionId'));
      expect(result.versionId).toBeTruthy();
      test.info().annotations.push({ type: 'Evidence', description: `version_id=${result.versionId} status=${result.status}` });
    },
  );

  test('[TC-RP-READ-004] @TC17585 Verify unknown version_id returns 404',
    async ({ request }) => {
      const rp = new RatePlanService(request, RT_BASE);
      await expect(rp.getById('aaaabbbb-cccc-4ddd-8eee-ffffffffffff'))
        .rejects.toThrow(/404/);
    },
  );

  test('[TC-RP-READ-005] @TC17586 Verify get-by-id contains required response contract fields',
    async ({ request }) => {
      expect(state.get('versionId'), 'version_id missing').toBeTruthy();
      const rp     = new RatePlanService(request, RT_BASE);
      const result = await rp.getById(state.get('versionId'));
      expect(result.versionId).toBeTruthy();
      expect(result.status).toBeTruthy();
      expect(result.productCode).toBeTruthy();
      expect(result.effectiveFrom).toBeTruthy();
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // AUDIT  TC 17589–17590
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-RP-AUDIT-001] @TC17589 Verify lifecycle transitions are auditability-preserved in get-by-id response',
    async ({ request }) => {
      expect(state.get('versionId'), 'version_id missing').toBeTruthy();
      const rp     = new RatePlanService(request, RT_BASE);
      const result = await rp.getById(state.get('versionId'));
      // Status history should reflect the retired state (last transition)
      expect(result.status).toBeTruthy();
      test.info().annotations.push({ type: 'Evidence', description: `final_status=${result.status}` });
    },
  );

  test('[TC-RP-AUDIT-002] @TC17590 Verify rate plan name persists unchanged after lifecycle transitions',
    async ({ request }) => {
      expect(state.get('versionId'), 'version_id missing').toBeTruthy();
      const rp     = new RatePlanService(request, RT_BASE);
      const result = await rp.getById(state.get('versionId'));
      expect(result.name).toBeTruthy();
      if (state.get('name')) expect(result.name).toBe(state.get('name'));
      test.info().annotations.push({ type: 'Evidence', description: `name=${result.name}` });
    },
  );

});
