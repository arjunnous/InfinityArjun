/**
 * utils/rate-plan-lifecycle.ts
 *
 * Reusable Rate Plan Lifecycle helper for Playwright API tests.
 *
 * Usage in any spec:
 *
 *   import { runRatePlanLifecycle, calculateOccurrencePremium } from '@utils/rate-plan-lifecycle';
 *
 *   // Full lifecycle in one call:
 *   const versionId = await runRatePlanLifecycle(request, {
 *     name:              'WCP-001 TX 2027',
 *     productCode:       'WCP-001',
 *     lineOfBusiness:    'WorkersCamp',
 *     jurisdictionCode:  'TX',
 *     effectiveFrom:     '2027-01-01',
 *     effectiveTo:       '2027-12-31',
 *   });
 *
 *   // Then calculate a premium:
 *   const result = await calculateOccurrencePremium(request, {
 *     versionId,
 *     productCode:     'WCP-001',
 *     lineOfBusiness:  'WorkersCamp',
 *     stateCode:       'TX',
 *     coverageCode:    'WC-MED',
 *     effectiveDate:   '2027-01-15',
 *     expirationDate:  '2027-12-31',
 *     baseExposure:    1.25,
 *   });
 *
 *   console.log(result.premiumCalculated);
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';

// ── Config (resolved from env at import time) ─────────────────────────────────
const RT_BASE = (
  process.env.RATING_ENGINE_URL ??
  'https://insurity-dev-microservice1-api-v2-ctc5era3h3euejgj.centralus-01.azurewebsites.net'
).replace(/\/$/, '');

const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface RatePlanOptions {
  /** Unique plan name (auto-suffixed with timestamp if not unique enough) */
  name:             string;
  productCode:      string;
  lineOfBusiness:   string;
  jurisdictionCode: string;
  effectiveFrom:    string;            // YYYY-MM-DD
  effectiveTo?:     string;            // YYYY-MM-DD  (optional, defaults to null)
  description?:     string;
  dayCountMethod?:  string;            // default: 'Actual365'
  gapBehavior?:     string;            // default: 'RaiseError'
  creatorId?:       string;            // default: 'test-user-01'
  approverId?:      string;            // default: 'approver-user-02'
  tenantId?:        string;            // default: TENANT_ID env constant
}

export interface OccurrenceOptions {
  versionId:        string;
  occurrenceId?:    string;
  policyId?:        string;
  transactionId?:   string;
  coverageCode:     string;
  stateCode:        string;
  productCode:      string;
  lineOfBusiness:   string;
  effectiveDate:    string;
  expirationDate:   string;
  baseExposure:     number;
  baseRate?:        number;            // default: 1200 (when rate plan has no base rates)
  transactionType?: string;            // default: 'NewBusiness'
  isDryRun?:        boolean;           // default: false
  tenantId?:        string;
}

export interface OccurrenceResult {
  resultId:          string | null;
  premiumCalculated: number | null;
  formulaApplied:    string | null;
  isSuccess:         boolean;
  isDryRun:          boolean;
  rawBody:           unknown;
}

export interface LifecycleResult {
  versionId:    string;
  status:       string;
  productCode:  string;
  effectiveFrom: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function uuid(): string {
  // Generate a valid RFC 4122 v4 UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const h4  = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  const h8  = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  const y   = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)];
  return `${h8()}-${h4()}-4${h4().slice(1)}-${y}${h4().slice(1)}-${h8()}${h4()}`;
}

async function withRetry(fn: () => Promise<APIResponse>): Promise<APIResponse> {
  for (let i = 1; i <= 5; i++) {
    const r = await fn();
    // Always retry 429 (rate limit)
    if (r.status() === 429) {
      console.log(`  [lifecycle] 429 rate limit — retry ${i} in ${5000 * i}ms`);
      await new Promise(res => setTimeout(res, 5000 * i));
      continue;
    }
    // Retry transient 422s (server-side intermittent DB/infrastructure failure)
    if (r.status() === 422) {
      try {
        const b = await r.json() as Record<string, unknown>;
        if (String(b.detail ?? b.title ?? '').toLowerCase().includes('transient')) {
          console.log(`  [lifecycle] 422 transient failure — retry ${i} in 15s`);
          await new Promise(res => setTimeout(res, 15000));
          continue;
        }
      } catch { /* non-JSON 422 — not transient, return as-is */ }
    }
    return r;
  }
  return fn();
}

async function post(
  request:  APIRequestContext,
  path:     string,
  body?:    unknown,
  label?:   string,
): Promise<APIResponse> {
  const url = RT_BASE + path;
  const tag = label ?? path.split('/').slice(-2).join('/');
  console.log(`\n[lifecycle] POST ${url}  (${tag})`);
  if (body) console.log(`  body: ${JSON.stringify(body).slice(0, 300)}`);

  const res = await withRetry(() =>
    request.post(url, {
      data:    body,
      headers: { 'Content-Type': 'application/vnd.api+json', Accept: 'application/json' },
      timeout: 30_000,
    })
  );

  let rb: unknown;
  try { rb = await res.json(); } catch { rb = '(empty)'; }
  console.log(`  <- ${res.status()} | ${JSON.stringify(rb).slice(0, 200)}`);
  return res;
}

// ── Action payload builder (submit / approve / pending / activate) ────────────

function actionPayload(
  actionBy: string,
  extra:    Record<string, unknown> = {},
  tenantId  = TENANT_ID,
) {
  return {
    data: {
      type: 'RatePlanVersionAction',
      attributes: { tenant_id: tenantId, action_by: actionBy, ...extra },
    },
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run the full Rate Plan lifecycle: Create → Submit → Approve → PendingActivation → Activate.
 *
 * Returns the version_id of the now-Active rate plan.
 * Throws an error (failing the test) if any step returns an unexpected status.
 */
export async function runRatePlanLifecycle(
  request: APIRequestContext,
  opts:    RatePlanOptions,
): Promise<string> {
  const creator  = opts.creatorId  ?? 'test-user-01';
  const approver = opts.approverId ?? 'approver-user-02';
  const tenant   = opts.tenantId   ?? TENANT_ID;

  // ── STEP 1: Create ──────────────────────────────────────────────────────────
  const createRes = await post(
    request,
    '/api/v1/ratingengine/rateplans',
    {
      data: {
        type: 'RatePlanVersion',
        attributes: {
          name:                    opts.name,
          created_by:              creator,
          product_code:            opts.productCode,
          line_of_business:        opts.lineOfBusiness,
          jurisdiction_code:       opts.jurisdictionCode,
          effective_from:          opts.effectiveFrom,
          effective_to:            opts.effectiveTo ?? null,
          description:             opts.description ?? `Automated test plan -- ${opts.name}`,
          day_count_method:        opts.dayCountMethod ?? 'Actual365',
          gap_behavior:            opts.gapBehavior ?? 'RaiseError',
          base_rates:              [],
          rating_factors:          [],
          formulas:                [],
          jurisdictional_adjustments: [],
        },
      },
    },
    'CREATE',
  );

  if (createRes.status() !== 201) {
    let errBody: unknown;
    try { errBody = await createRes.json(); } catch { errBody = '(non-JSON)'; }
    throw new Error(`[lifecycle] CREATE failed: status=${createRes.status()} body=${JSON.stringify(errBody).slice(0, 300)}`);
  }

  const createBody = await createRes.json() as { data: Record<string, unknown> };
  const versionId  = String(createBody.data?.version_id ?? createBody.data?.id ?? '');
  if (!versionId) throw new Error(`[lifecycle] CREATE returned no version_id: ${JSON.stringify(createBody)}`);
  console.log(`  [lifecycle] version_id = ${versionId}`);

  // ── STEP 2: Submit ──────────────────────────────────────────────────────────
  const submitRes = await post(
    request,
    `/api/v1/ratingengine/rateplans/${versionId}/submit`,
    actionPayload(creator, {}, tenant),
    'SUBMIT',
  );
  if (![200, 204].includes(submitRes.status())) {
    throw new Error(`[lifecycle] SUBMIT failed: status=${submitRes.status()}`);
  }

  // ── STEP 3: Approve (different user enforces four-eyes rule) ─────────────────
  const approveRes = await post(
    request,
    `/api/v1/ratingengine/rateplans/${versionId}/approve`,
    actionPayload(approver, {}, tenant),
    'APPROVE',
  );
  if (![200, 204].includes(approveRes.status())) {
    throw new Error(`[lifecycle] APPROVE failed: status=${approveRes.status()}`);
  }

  // ── STEP 4: Pending Activation ───────────────────────────────────────────────
  const pendingRes = await post(
    request,
    `/api/v1/ratingengine/rateplans/${versionId}/pendingactivation`,
    actionPayload(creator, { scheduled_date: opts.effectiveFrom }, tenant),
    'PENDING-ACTIVATION',
  );
  if (![200, 204].includes(pendingRes.status())) {
    throw new Error(`[lifecycle] PENDING-ACTIVATION failed: status=${pendingRes.status()}`);
  }

  // ── STEP 5: Activate ────────────────────────────────────────────────────────
  const activateRes = await post(
    request,
    `/api/v1/ratingengine/rateplans/${versionId}/activate`,
    actionPayload(creator, {}, tenant),
    'ACTIVATE',
  );
  if (![200, 204].includes(activateRes.status())) {
    throw new Error(`[lifecycle] ACTIVATE failed: status=${activateRes.status()}`);
  }

  console.log(`\n[lifecycle] Rate plan ACTIVE: version_id=${versionId}`);
  return versionId;
}

/**
 * Calculate an occurrence-level premium using an Active rate plan version.
 * Returns structured result with premiumCalculated, resultId, formulaApplied.
 */
export async function calculateOccurrencePremium(
  request: APIRequestContext,
  opts:    OccurrenceOptions,
): Promise<OccurrenceResult> {
  const tenant = opts.tenantId ?? TENANT_ID;

  const res = await post(
    request,
    '/api/v1/ratingengine/occurrences/calculate',
    {
      data: {
        type: 'OccurrencePremium',
        attributes: {
          tenant_id:            tenant,
          occurrence_id:        opts.occurrenceId  ?? uuid(),
          policy_id:            opts.policyId      ?? uuid(),
          transaction_id:       opts.transactionId ?? uuid(),
          coverage_code:        opts.coverageCode,
          state_code:           opts.stateCode,
          product_code:         opts.productCode,
          line_of_business:     opts.lineOfBusiness,
          rate_plan_version_id: opts.versionId,
          effective_date:       opts.effectiveDate,
          expiration_date:      opts.expirationDate,
          base_exposure:        opts.baseExposure,
          base_rate:            opts.baseRate ?? 1200,   // passed when plan has no base rates in DB
          transaction_type:     opts.transactionType ?? 'NewBusiness',
          is_dry_run:           opts.isDryRun       ?? false,
        },
      },
    },
    'CALCULATE',
  );

  let body: Record<string, unknown> = {};
  try { body = await res.json() as Record<string, unknown>; } catch {}
  // OccurrencePremiumResponse: result_id is directly on data (NOT inside data.attributes)
  const d     = (body.data as Record<string, unknown>) ?? body;
  const attrs = (d.attributes as Record<string, unknown>) ?? {};

  return {
    resultId:          String(d.result_id         ?? attrs.result_id         ?? body.result_id         ?? ''),
    premiumCalculated: Number(d.final_premium      ?? attrs.final_premium     ?? body.premium_calculated ?? 0),
    formulaApplied:    String(d.rate_plan_version_id ?? attrs.formula_applied ?? body.formula_applied   ?? ''),
    isSuccess:         Boolean(d.is_success        ?? attrs.is_success        ?? body.is_success        ?? false),
    isDryRun:          Boolean(d.is_dry_run         ?? attrs.is_dry_run        ?? body.is_dry_run        ?? false),
    rawBody:           body,
  };
}

/**
 * Convenience: Create rate plan lifecycle + calculate premium in one call.
 * Returns { versionId, occurrenceResult }.
 */
export async function createAndCalculate(
  request:    APIRequestContext,
  planOpts:   RatePlanOptions,
  calcOpts:   Omit<OccurrenceOptions, 'versionId'>,
): Promise<{ versionId: string; occurrenceResult: OccurrenceResult }> {
  const versionId       = await runRatePlanLifecycle(request, planOpts);
  const occurrenceResult = await calculateOccurrencePremium(request, { ...calcOpts, versionId });
  return { versionId, occurrenceResult };
}
