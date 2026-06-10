/**
 * services/rating/RatePlanService.ts
 *
 * Service Object for the Rating Engine — Rate Plan endpoints.
 *
 *   POST   /api/v1/ratingengine/rateplans              → 201  Create
 *   POST   /api/v1/ratingengine/rateplans/{id}/submit
 *   POST   /api/v1/ratingengine/rateplans/{id}/approve
 *   POST   /api/v1/ratingengine/rateplans/{id}/pendingactivation
 *   POST   /api/v1/ratingengine/rateplans/{id}/activate
 *   GET    /api/v1/ratingengine/rateplans/{id}
 *   GET    /api/v1/ratingengine/rateplans              (list)
 *
 * Usage:
 *   const rp = new RatePlanService(request, process.env.RATING_ENGINE_URL!);
 *   const versionId = await rp.runLifecycle({ name, productCode, ... });
 */

import type { APIRequestContext } from '@playwright/test';
import { BaseApiService }         from '@services/common/BaseApiService';

// ─── Request / Response types ─────────────────────────────────────────────────

export interface CreateRatePlanRequest {
  name:             string;
  productCode:      string;
  lineOfBusiness:   string;
  jurisdictionCode: string;
  effectiveFrom:    string;            // YYYY-MM-DD
  effectiveTo?:     string | null;
  description?:     string;
  dayCountMethod?:  string;            // default: 'Actual365'
  gapBehavior?:     string;            // default: 'RaiseError'
  createdBy?:       string;
}

export interface RatePlanActionRequest {
  actionBy:       string;
  tenantId?:      string;
  scheduledDate?: string;             // required for pendingActivation
}

export interface RatePlanResponse {
  versionId:    string;
  name:         string;
  status:       string;
  productCode:  string;
  effectiveFrom: string;
}

export interface LifecycleOptions extends CreateRatePlanRequest {
  creatorId?:  string;
  approverId?: string;
  tenantId?:   string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const TENANT_ID    = process.env['TENANT_ID'] ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CREATOR_ID   = 'test-user-01';
const APPROVER_ID  = 'approver-user-02';
const BASE_PATH    = '/api/v1/ratingengine/rateplans';

export class RatePlanService extends BaseApiService {

  constructor(request: APIRequestContext, baseUrl: string) {
    super(request, baseUrl);
  }

  /** Create a new rate plan version. Returns the versionId. */
  async create(opts: CreateRatePlanRequest): Promise<RatePlanResponse> {
    const res = await this.post<Record<string, unknown>>(BASE_PATH, {
      data: {
        type: 'RatePlanVersion',
        attributes: {
          name:                    opts.name,
          created_by:              opts.createdBy ?? CREATOR_ID,
          product_code:            opts.productCode,
          line_of_business:        opts.lineOfBusiness,
          jurisdiction_code:       opts.jurisdictionCode,
          effective_from:          opts.effectiveFrom,
          effective_to:            opts.effectiveTo ?? null,
          description:             opts.description ?? `Automated test — ${opts.name}`,
          day_count_method:        opts.dayCountMethod ?? 'Actual365',
          gap_behavior:            opts.gapBehavior   ?? 'RaiseError',
          base_rates:              [],
          rating_factors:          [],
          formulas:                [],
          jurisdictional_adjustments: [],
        },
      },
    });

    if (res.status !== 201) {
      throw new Error(`[RatePlanService.create] Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    }

    const data = (res.body as Record<string, unknown>)['data'] as Record<string, unknown>;
    const versionId = String(data?.['version_id'] ?? data?.['id'] ?? '');
    if (!versionId) throw new Error('[RatePlanService.create] No version_id in response');

    return {
      versionId,
      name:         String(data?.['name']           ?? opts.name),
      status:       String(data?.['status']          ?? 'Draft'),
      productCode:  String(data?.['product_code']    ?? opts.productCode),
      effectiveFrom: String(data?.['effective_from'] ?? opts.effectiveFrom),
    };
  }

  /** Submit the rate plan for review. */
  async submit(versionId: string, opts?: RatePlanActionRequest): Promise<void> {
    const res = await this.post(`${BASE_PATH}/${versionId}/submit`, this.actionBody(opts));
    if (![200, 204].includes(res.status)) {
      throw new Error(`[RatePlanService.submit] Expected 200/204, got ${res.status}`);
    }
  }

  /** Approve the rate plan (must be a different user from the creator — four-eyes rule). */
  async approve(versionId: string, opts?: RatePlanActionRequest): Promise<void> {
    const res = await this.post(`${BASE_PATH}/${versionId}/approve`,
      this.actionBody({ actionBy: APPROVER_ID, ...opts }));
    if (![200, 204].includes(res.status)) {
      throw new Error(`[RatePlanService.approve] Expected 200/204, got ${res.status}`);
    }
  }

  /** Schedule the rate plan for activation. scheduledDate must be ≥ effectiveFrom. */
  async pendingActivation(
    versionId:     string,
    scheduledDate: string,
    opts?:         RatePlanActionRequest,
  ): Promise<void> {
    const res = await this.post(`${BASE_PATH}/${versionId}/pendingactivation`,
      this.actionBody({ scheduledDate, ...opts }));
    if (![200, 204].includes(res.status)) {
      throw new Error(`[RatePlanService.pendingActivation] Expected 200/204, got ${res.status}`);
    }
  }

  /** Activate the rate plan. */
  async activate(versionId: string, opts?: RatePlanActionRequest): Promise<void> {
    const res = await this.post(`${BASE_PATH}/${versionId}/activate`, this.actionBody(opts));
    if (![200, 204].includes(res.status)) {
      throw new Error(`[RatePlanService.activate] Expected 200/204, got ${res.status}`);
    }
  }

  /** Retire an active rate plan (moves to Retired status). */
  async retire(versionId: string, opts?: RatePlanActionRequest): Promise<void> {
    const res = await this.post(`${BASE_PATH}/${versionId}/retire`, this.actionBody(opts));
    if (![200, 204].includes(res.status)) {
      throw new Error(`[RatePlanService.retire] Expected 200/204, got ${res.status}`);
    }
  }

  /** Resolve the active rate plan for a product/LOB/jurisdiction. */
  async resolve(params: { productCode: string; lineOfBusiness: string; jurisdictionCode: string; effectiveDate?: string }): Promise<RatePlanResponse> {
    const q: Record<string, string> = {
      productCode:     params.productCode,
      lineOfBusiness:  params.lineOfBusiness,
      jurisdictionCode: params.jurisdictionCode,
    };
    if (params.effectiveDate) q['effectiveDate'] = params.effectiveDate;
    const res = await this.get<Record<string, unknown>>(`${BASE_PATH}/resolve`, q);
    if (res.status !== 200) {
      throw new Error(`[RatePlanService.resolve] Expected 200, got ${res.status}`);
    }
    const data = (res.body['data'] as Record<string, unknown>) ?? res.body;
    return {
      versionId:    String(data['version_id']  ?? data['id']           ?? ''),
      name:         String(data['name']         ?? ''),
      status:       String(data['status']       ?? ''),
      productCode:  String(data['product_code'] ?? ''),
      effectiveFrom: String(data['effective_from'] ?? ''),
    };
  }

  /** List all rate plans (paginated). */
  async list(params?: { pageSize?: number; page?: number }): Promise<RatePlanResponse[]> {
    const q: Record<string, string> = {};
    if (params?.pageSize) q['page[size]']   = String(params.pageSize);
    if (params?.page)     q['page[number]'] = String(params.page);
    const res = await this.get<Record<string, unknown>>(BASE_PATH, q);
    if (res.status !== 200) {
      throw new Error(`[RatePlanService.list] Expected 200, got ${res.status}`);
    }
    const items: unknown[] = Array.isArray(res.body['data']) ? res.body['data'] as unknown[]
      : Array.isArray(res.body) ? res.body as unknown[] : [];
    return items.map((i: unknown) => {
      const d = i as Record<string, unknown>;
      return {
        versionId:    String(d['version_id']   ?? d['id']  ?? ''),
        name:         String(d['name']          ?? ''),
        status:       String(d['status']        ?? ''),
        productCode:  String(d['product_code']  ?? ''),
        effectiveFrom: String(d['effective_from'] ?? ''),
      };
    });
  }

  /** Get a single rate plan by versionId. */
  async getById(versionId: string): Promise<RatePlanResponse> {
    const res = await this.get<Record<string, unknown>>(`${BASE_PATH}/${versionId}`);
    if (res.status !== 200) {
      throw new Error(`[RatePlanService.getById] Expected 200, got ${res.status}`);
    }
    const data = (res.body['data'] as Record<string, unknown>) ?? res.body;
    return {
      versionId:    String(data['version_id']  ?? data['id']           ?? ''),
      name:         String(data['name']         ?? ''),
      status:       String(data['status']       ?? ''),
      productCode:  String(data['product_code'] ?? ''),
      effectiveFrom: String(data['effective_from'] ?? ''),
    };
  }

  /**
   * Run the full lifecycle: Create → Submit → Approve → PendingActivation → Activate.
   * Returns the versionId of the now-Active rate plan.
   */
  async runLifecycle(opts: LifecycleOptions): Promise<string> {
    const creator  = opts.creatorId  ?? CREATOR_ID;
    const approver = opts.approverId ?? APPROVER_ID;
    const tenant   = opts.tenantId   ?? TENANT_ID;

    const rp = await this.create({ ...opts, createdBy: creator });
    console.log(`  [RatePlanService] Created version_id=${rp.versionId}`);

    await this.submit(rp.versionId, { actionBy: creator, tenantId: tenant });
    await this.approve(rp.versionId, { actionBy: approver, tenantId: tenant });
    await this.pendingActivation(rp.versionId, opts.effectiveFrom, { actionBy: creator, tenantId: tenant });
    await this.activate(rp.versionId, { actionBy: creator, tenantId: tenant });

    console.log(`  [RatePlanService] Rate plan ACTIVE: version_id=${rp.versionId}`);
    return rp.versionId;
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private actionBody(opts?: RatePlanActionRequest): Record<string, unknown> {
    const extra: Record<string, unknown> = {};
    if (opts?.scheduledDate) extra['scheduled_date'] = opts.scheduledDate;
    return {
      data: {
        type: 'RatePlanVersionAction',
        attributes: {
          tenant_id:  opts?.tenantId  ?? TENANT_ID,
          action_by:  opts?.actionBy  ?? CREATOR_ID,
          ...extra,
        },
      },
    };
  }
}
