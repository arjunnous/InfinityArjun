// File: tests/pod3-rules/api/suite18181.spec.ts
// ADO Suite  : 18181
// ADO Plan   : 18163 — US-4.3 Flexible Data Model Support
//
// ─── Page Object Model ────────────────────────────────────────────────────────
// All HTTP calls go through FieldModelService — this file has ONLY test() blocks.
//
//   FieldModelService → /api/v1/rules/data-model/fields + /entities

import { test, expect, useSuiteAnnotations } from '@fixtures/tc-fixture';
import { FieldModelService }                  from '@services/rules/FieldModelService';
import { StateManager }                       from '@utils/StateManager';

const RULES_URL = (process.env['RULES_URL'] ?? '').replace(/\/$/, '');

test.describe('Suite 18181 — Flexible Data Model Support', () => {

  useSuiteAnnotations('18181', '18163');

  const state = new StateManager('suite18181');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — FIELD DEFINITION CRUD  TC 4.3-001–008
  // ══════════════════════════════════════════════════════════════════════════

  test.describe('FIELD — CRUD + Validation', () => {

    test('[TC-4.3-001] Verify creating a String field returns 201 with fieldCode and dataType',
      async ({ request }) => {
        const svc    = new FieldModelService(request, RULES_URL);
        const result = await svc.createField({ dataType: 'String', required: false });
        expect(result.id).toBeTruthy();
        expect(result.fieldCode).toBeTruthy();
        expect(result.dataType).toBe('String');
        state.set('fieldId', result.id);
        test.info().annotations.push({ type: 'Evidence', description: `id=${result.id} fieldCode=${result.fieldCode}` });
      },
    );

    test('[TC-4.3-002] Verify creating an Integer field returns correct dataType',
      async ({ request }) => {
        const svc    = new FieldModelService(request, RULES_URL);
        const result = await svc.createField({ dataType: 'Integer' });
        expect(result.id).toBeTruthy();
        expect(result.dataType).toBe('Integer');
        test.info().annotations.push({ type: 'Evidence', description: `id=${result.id} dataType=${result.dataType}` });
      },
    );

    test('[TC-4.3-003] Verify creating a Boolean field returns correct dataType',
      async ({ request }) => {
        const svc    = new FieldModelService(request, RULES_URL);
        const result = await svc.createField({ dataType: 'Boolean' });
        expect(result.id).toBeTruthy();
        expect(result.dataType).toBe('Boolean');
      },
    );

    test('[TC-4.3-004] Verify creating a Date field returns correct dataType',
      async ({ request }) => {
        const svc    = new FieldModelService(request, RULES_URL);
        const result = await svc.createField({ dataType: 'Date' });
        expect(result.id).toBeTruthy();
        expect(result.dataType).toBe('Date');
      },
    );

    test('[TC-4.3-005] Verify GET /fields returns list of field definitions',
      async ({ request }) => {
        const svc    = new FieldModelService(request, RULES_URL);
        const result = await svc.listFields();
        expect(Array.isArray(result)).toBe(true);
        test.info().annotations.push({ type: 'Evidence', description: `fields.count=${result.length}` });
      },
    );

    test('[TC-4.3-006] Verify GET /fields/{id} returns the specific field',
      async ({ request }) => {
        expect(state.get('fieldId'), 'fieldId missing — TC-4.3-001 must complete').toBeTruthy();
        const svc    = new FieldModelService(request, RULES_URL);
        const result = await svc.getField(state.get('fieldId'));
        expect(result.id).toBe(state.get('fieldId'));
        test.info().annotations.push({ type: 'Evidence', description: `id=${result.id} dataType=${result.dataType}` });
      },
    );

    test('[TC-4.3-007] Verify PUT /fields/{id}/validation updates validation rules',
      async ({ request }) => {
        expect(state.get('fieldId'), 'fieldId missing').toBeTruthy();
        const svc    = new FieldModelService(request, RULES_URL);
        const result = await svc.updateValidation(state.get('fieldId'), { required: true });
        expect(result.id).toBe(state.get('fieldId'));
        test.info().annotations.push({ type: 'Evidence', description: `id=${result.id} required updated` });
      },
    );

    test('[TC-4.3-008] Verify updating with minValue and maxValue for numeric field',
      async ({ request }) => {
        const svc    = new FieldModelService(request, RULES_URL);
        const field  = await svc.createField({ dataType: 'Integer' });
        const result = await svc.updateValidation(field.id, { minValue: 0, maxValue: 100 });
        expect(result.id).toBe(field.id);
      },
    );

  }); // end serial fields

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — CUSTOM ENTITY CRUD  TC 4.3-009–015
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-4.3-009] Verify creating a custom entity returns 201 with entityCode',
    async ({ request }) => {
      const svc    = new FieldModelService(request, RULES_URL);
      const result = await svc.createEntity();
      expect(result.id).toBeTruthy();
      expect(result.entityCode).toBeTruthy();
      test.info().annotations.push({ type: 'Evidence', description: `id=${result.id} entityCode=${result.entityCode}` });
    },
  );

  test('[TC-4.3-010] Verify GET /entities returns list of custom entities',
    async ({ request }) => {
      const svc    = new FieldModelService(request, RULES_URL);
      const result = await svc.listEntities();
      expect(Array.isArray(result)).toBe(true);
      test.info().annotations.push({ type: 'Evidence', description: `entities.count=${result.length}` });
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION — Negative
  // ══════════════════════════════════════════════════════════════════════════

  test('[TC-4.3-NEG-001] Verify GET /fields/{unknownId} returns 404',
    async ({ request }) => {
      const svc = new FieldModelService(request, RULES_URL);
      await expect(svc.getField('aaaabbbb-cccc-4ddd-8eee-ffffffffffff')).rejects.toThrow(/404/);
    },
  );

  test('[TC-4.3-NEG-002] Verify invalid dataType returns 400/422',
    async ({ request }) => {
      const svc = new FieldModelService(request, RULES_URL);
      await expect(svc.createField({ dataType: 'INVALID_TYPE' })).rejects.toThrow(/4\d\d/);
    },
  );

});
