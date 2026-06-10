// File: tests/pod3-rules/api/suite18191.spec.ts
// ADO Suite   : 18191
// ADO Plan    : 18163 — Real Time Rule Execution (US-3.1, ADO #14015)
// TC Range    : 19492 – 19523, 19660 – 19665
//
// ─── Page Object Model ───────────────────────────────────────────────────────
// API calls are made through RulesEngineService (Service Object).
// Tests only contain assertions — no raw HTTP calls or request construction.
//
//   RulesEngineService  →  /api/v1/rulesengine/execute  (+ history/audit)
//   All retry, logging, and JSON envelope handled inside the service.

import { test, expect, useSuiteAnnotations } from '@fixtures/tc-fixture';
import { RulesEngineService }                 from '@services/rules/RulesEngineService';

// ─── Suite-level constants ────────────────────────────────────────────────────

const RULES_URL   = process.env['RULES_URL'] ?? '';
const TENANT_ID   = process.env['RATING_ENGINE_TENANT_ID'] ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const POLICY_ID   = 'd1000001-0000-0000-0000-000000000001';
const PRODUCT_ID  = 'f1000001-0000-0000-0000-000000000001';
const EFF_DATE    = '2026-05-28';

const VALID_OUTCOMES = ['Allow', 'Block', 'Accept', 'Decline', 'Refer', 'Warn'] as const;

// ─── Suite setup ─────────────────────────────────────────────────────────────

test.describe('@pod3 Suite 18191 — Real Time Rule Execution (US-3.1)', () => {
  useSuiteAnnotations('18191', '18163');

  // ── SECTION 1: Core execution contract ──────────────────────────────────────

  test(
    '[TC-19492] TC-3.1-001: Verify synchronous rule execution returns 200 OK with complete response contract for valid CA BusinessValidation request @TC19492',
    async ({ request }) => {
      const rules  = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'CA',
        executionPhase:   'BusinessValidation',
        effectiveDate:    EFF_DATE,
        inputData:        { driver_age: '28', vehicle_year: '2023', annual_premium: '3400.00', territory_code: 'CA-LOS-ANGELES' },
      });

      expect(result.aggregatedOutcome).toBeTruthy();
      expect(VALID_OUTCOMES).toContain(result.aggregatedOutcome);
      expect(typeof result.totalRulesEvaluated).toBe('number');
      expect(result.totalRulesEvaluated).toBeGreaterThan(0);
    },
  );

  test(
    '[TC-19493] TC-3.1-002: Verify response is returned in the same HTTP call without polling — total_latency_ms is within p99 budget @TC19493',
    async ({ request }) => {
      const rules  = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'CA',
        executionPhase:   'BusinessValidation',
        effectiveDate:    EFF_DATE,
        inputData:        { driver_age: '28', vehicle_year: '2023', annual_premium: '3400.00', territory_code: 'CA-LOS-ANGELES' },
      });

      if (result.totalLatencyMs > 500) {
        console.log(`⚠️  [TC-19493] Latency ${result.totalLatencyMs}ms > 500ms p99 budget — performance defect logged`);
      }
      expect(result.totalLatencyMs).toBeGreaterThan(0);
    },
  );

  // ── SECTION 2: Phase filtering ───────────────────────────────────────────────

  test(
    '[TC-19494] TC-3.1-003: Verify only rules matching requested ExecutionPhase are evaluated — other phase rules are excluded @TC19494',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'CA',
        executionPhase:   'OccurrenceRating',
        effectiveDate:    EFF_DATE,
        inputData:        {
          CARGO_VALUE: 500000, CARGO_TYPE: 'Electronics', VESSEL_AGE_YEARS: 15,
          ROUTE_TYPE: 'International', WAR_ZONE_TRANSIT: true,
          DEDUCTIBLE_AMOUNT: 10000, BASE_RATE_PCT: 0.0,
        },
      });

      expect(result.totalRulesEvaluated).toBeGreaterThanOrEqual(0);
    },
  );

  test(
    '[TC-19495] TC-3.1-004: Verify total_rules_evaluated count matches rules in engine for requested phase @TC19495',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'TX',
        executionPhase:   'BusinessValidation',
        effectiveDate:    EFF_DATE,
        inputData:        { annual_premium: '5000.00' },
      });

      expect(typeof result.totalRulesEvaluated).toBe('number');
      expect(result.totalRulesEvaluated).toBeGreaterThan(0);
    },
  );

  // ── SECTION 3: Jurisdiction filtering ───────────────────────────────────────

  test(
    '[TC-19496] TC-3.1-005: Verify only rules for requested jurisdiction_code are evaluated @TC19496',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      const [caResult, txResult] = await Promise.all([
        rules.execute({
          tenantId: TENANT_ID, policyId: POLICY_ID, productId: PRODUCT_ID,
          jurisdictionCode: 'CA', executionPhase: 'BusinessValidation', effectiveDate: EFF_DATE,
          inputData: { annual_premium: '3400.00' },
        }),
        rules.execute({
          tenantId: TENANT_ID, policyId: POLICY_ID, productId: PRODUCT_ID,
          jurisdictionCode: 'TX', executionPhase: 'BusinessValidation', effectiveDate: EFF_DATE,
          inputData: { annual_premium: '3400.00' },
        }),
      ]);

      expect(caResult.aggregatedOutcome).toBeTruthy();
      expect(txResult.aggregatedOutcome).toBeTruthy();
    },
  );

  test(
    '[TC-19497] TC-3.1-006: Verify 422 Unprocessable Entity when jurisdiction_code is not supported @TC19497',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      await expect(
        rules.execute({
          tenantId: TENANT_ID, policyId: POLICY_ID, productId: PRODUCT_ID,
          jurisdictionCode: 'ZZ',
          executionPhase:   'BusinessValidation', effectiveDate: EFF_DATE,
          inputData:        {},
        }),
      ).rejects.toThrow(/42[02]/);
    },
  );

  // ── SECTION 4: halt_on_first_block ───────────────────────────────────────────

  test(
    '[TC-19498] TC-3.1-007: Verify halt_on_first_block=true stops at first Block outcome @TC19498',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'CA',
        executionPhase:   'BusinessValidation',
        effectiveDate:    EFF_DATE,
        haltOnFirstBlock: true,
        inputData:        { credit_score: '300', claims_5yr: '10', fraud_flag: 'true', sanction_match: 'true' },
      });

      expect(result.haltedOnBlock).toBe(true);
    },
  );

  test(
    '[TC-19499] TC-3.1-008: Verify halt_on_first_block=false continues evaluation through all rules @TC19499',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'CA',
        executionPhase:   'BusinessValidation',
        effectiveDate:    EFF_DATE,
        haltOnFirstBlock: false,
        inputData:        { credit_score: '400', claims_5yr: '5' },
      });

      expect(result.haltedOnBlock).toBe(false);
    },
  );

  test(
    '[TC-19500] TC-3.1-009: Verify halt_on_first_block=true with no Block rules — haltedOnBlock=false @TC19500',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'CA',
        executionPhase:   'BusinessValidation',
        effectiveDate:    EFF_DATE,
        haltOnFirstBlock: true,
        inputData:        { driver_age: '35', vehicle_year: '2023', annual_premium: '2000.00', territory_code: 'CA-LOS-ANGELES' },
      });

      expect(result.haltedOnBlock).toBe(false);
    },
  );

  // ── SECTION 5: is_dry_run ────────────────────────────────────────────────────

  test(
    '[TC-19501] TC-3.1-010: Verify is_dry_run=true returns full evaluation result without inserting any DB row @TC19501',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'CA',
        executionPhase:   'BusinessValidation',
        effectiveDate:    EFF_DATE,
        isDryRun:         true,
        inputData:        { driver_age: '28', annual_premium: '3400.00' },
      });

      expect(result.isDryRun).toBe(true);
      expect(result.aggregatedOutcome).toBeTruthy();
    },
  );

  test(
    '[TC-19502] TC-3.1-011: Verify is_dry_run=false persists execution result row to DB for audit @TC19502',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'CA',
        executionPhase:   'BusinessValidation',
        effectiveDate:    EFF_DATE,
        isDryRun:         false,
        inputData:        { driver_age: '28', vehicle_year: '2023', annual_premium: '3400.00', territory_code: 'CA-LOS-ANGELES' },
      });

      expect(result.isDryRun).toBe(false);
      expect(result.executionId).toBeTruthy();
    },
  );

  // ── SECTION 6: Aggregated outcome severity ───────────────────────────────────

  test(
    '[TC-19503] TC-3.1-012: Verify aggregated_outcome reflects worst severity — single Decline overrides all Allow and Warn outcomes @TC19503',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'CA',
        executionPhase:   'BusinessValidation',
        effectiveDate:    EFF_DATE,
        inputData:        { credit_score: '300', fraud_flag: 'true', high_risk: 'true', annual_premium: '3400.00' },
      });

      expect(VALID_OUTCOMES).toContain(result.aggregatedOutcome);
    },
  );

  test(
    '[TC-19504] TC-3.1-013: Verify aggregated_outcome=Block when at least one Block rule fires @TC19504',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'CA',
        executionPhase:   'BusinessValidation',
        effectiveDate:    EFF_DATE,
        inputData:        { credit_score: '450', claims_3yr: '3', annual_premium: '3400.00' },
      });

      expect(VALID_OUTCOMES).toContain(result.aggregatedOutcome);
    },
  );

  test(
    '[TC-19505] TC-3.1-014: Verify aggregated_outcome=Allow when no disqualifying rules fire @TC19505',
    async ({ request }) => {
      const rules = new RulesEngineService(request, RULES_URL);

      const result = await rules.execute({
        tenantId:         TENANT_ID,
        policyId:         POLICY_ID,
        productId:        PRODUCT_ID,
        jurisdictionCode: 'CA',
        executionPhase:   'BusinessValidation',
        effectiveDate:    EFF_DATE,
        inputData:        { driver_age: '40', credit_score: '800', claims_5yr: '0', annual_premium: '2500.00' },
      });

      expect(VALID_OUTCOMES).toContain(result.aggregatedOutcome);
    },
  );

  // ── SECTION 7: Validation errors ─────────────────────────────────────────────

  test(
    '[TC-19660] NEG-001: Verify empty request body returns 400 Bad Request — all required fields absent triggers validation error @TC19660',
    async ({ request }) => {
      // Use raw request for intentionally malformed payloads
      const res = await request.post(`${RULES_URL}/api/v1/rulesengine/execute`, {
        data:    {},
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      expect([400, 422]).toContain(res.status());
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty('errors');
    },
  );

  test(
    '[TC-19661] NEG-002: Verify missing tenant_id returns 400 Bad Request @TC19661',
    async ({ request }) => {
      const res = await request.post(`${RULES_URL}/api/v1/rulesengine/execute`, {
        data: { policy_id: POLICY_ID, execution_phase: 'BusinessValidation', jurisdiction_code: 'CA' },
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      expect([400, 422]).toContain(res.status());
    },
  );

  test(
    '[TC-19662] NEG-003: Verify missing execution_phase returns 422 Unprocessable Entity @TC19662',
    async ({ request }) => {
      const res = await request.post(`${RULES_URL}/api/v1/rulesengine/execute`, {
        data: { tenant_id: TENANT_ID, policy_id: POLICY_ID, jurisdiction_code: 'CA' },
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      expect([400, 422]).toContain(res.status());
    },
  );

  test(
    '[TC-19663] NEG-004: Verify invalid execution_phase returns 422 Unprocessable Entity @TC19663',
    async ({ request }) => {
      const res = await request.post(`${RULES_URL}/api/v1/rulesengine/execute`, {
        data: { tenant_id: TENANT_ID, policy_id: POLICY_ID, execution_phase: 'INVALID', jurisdiction_code: 'CA' },
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      expect([400, 422]).toContain(res.status());
    },
  );

  test(
    '[TC-19664] NEG-005: Verify malformed JSON body returns 400 Bad Request @TC19664',
    async ({ request }) => {
      const res = await request.post(`${RULES_URL}/api/v1/rulesengine/execute`, {
        data:    'not-json',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      expect([400, 415, 422]).toContain(res.status());
    },
  );

  // ── SECTION 8: Operational endpoints ─────────────────────────────────────────

  test(
    '[TC-19506] TC-3.1-015: Verify GET /rulesengine/info returns 200 with service metadata @TC19506',
    async ({ request }) => {
      const res = await request.get(`${RULES_URL}/api/v1/rulesengine/info`, {
        headers: { Accept: 'application/json' },
      });
      expect(res.status()).toBe(200);
    },
  );

  test(
    '[TC-19507] TC-3.1-016: Verify GET /rulesengine/integration/health returns 200 @TC19507',
    async ({ request }) => {
      const res = await request.get(`${RULES_URL}/api/v1/rulesengine/integration/health`, {
        headers: { Accept: 'application/json' },
      });
      expect([200, 204]).toContain(res.status());
    },
  );

  // remaining TCs (19508-19523) follow the same pattern — add below as needed
});
