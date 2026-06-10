/**
 * services/rating/OccurrenceService.ts
 *
 * Service Object for the Rating Engine — Occurrence endpoints.
 *
 *   POST   /api/v1/ratingengine/occurrences/calculate
 *   POST   /api/v1/ratingengine/occurrences/{resultId}/recalculate
 *   GET    /api/v1/ratingengine/occurrences/{resultId}
 *   GET    /api/v1/ratingengine/occurrences/bytransaction/{transactionId}
 *   GET    /api/v1/ratingengine/occurrences/bypolicy/{policyId}
 *
 * Usage:
 *   const occ = new OccurrenceService(request, process.env.RATING_ENGINE_URL!);
 *   const result = await occ.calculate({ versionId, coverageCode, ... });
 */

import type { APIRequestContext } from '@playwright/test';
import { BaseApiService }         from '@services/common/BaseApiService';

// ─── Request / Response types ─────────────────────────────────────────────────

export interface CalculateRequest {
  versionId:          string;
  coverageCode:       string;
  stateCode:          string;
  productCode:        string;
  lineOfBusiness:     string;
  effectiveDate:      string;
  expirationDate:     string;
  baseExposure:       number;
  baseRate?:          number;            // default 1200
  transactionType?:   string;            // default 'NewBusiness'
  isDryRun?:          boolean;
  occurrenceId?:      string;
  policyId?:          string;
  transactionId?:     string;
  tenantId?:          string;
  // Some suites pass extension_attributes so the engine resolves the rate plan
  // by productCode/lineOfBusiness/jurisdictionCode rather than by versionId alone.
  extensionAttributes?: {
    productCode:      string;
    lineOfBusiness:   string;
    jurisdictionCode: string;
    [key: string]: unknown;
  };
}

export interface OccurrenceResult {
  resultId:              string;
  policyId:              string;
  occurrenceId:          string;
  transactionId:         string;
  finalPremium:          number;
  preRoundingPremium:    number;
  isDryRun:              boolean;
  isSuccess:             boolean;
  minimumPremiumApplied: boolean;
  yearDenominator:       number;
  spansLeapDay:          boolean;
  termDays:              number;
  ratePlanVersionId:     string;
  supersededBy:          string;
  factorsApplied:        unknown[];
  rawBody:               unknown;
}

const BASE_PATH  = '/api/v1/ratingengine/occurrences';
const TENANT_ID  = process.env['TENANT_ID'] ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ─── Service ──────────────────────────────────────────────────────────────────

export class OccurrenceService extends BaseApiService {

  constructor(request: APIRequestContext, baseUrl: string) {
    super(request, baseUrl);
  }

  /** Calculate a new occurrence-level premium. */
  async calculate(opts: CalculateRequest): Promise<OccurrenceResult> {
    const res = await this.post<Record<string, unknown>>(
      `${BASE_PATH}/calculate`,
      this.buildPayload(opts),
    );
    if (res.status !== 200) {
      throw new Error(`[OccurrenceService.calculate] Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return this.parseResult(res.body);
  }

  /** Recalculate an existing occurrence (returns a NEW result_id; prior is superseded). */
  async recalculate(resultId: string, opts: CalculateRequest): Promise<OccurrenceResult> {
    const res = await this.post<Record<string, unknown>>(
      `${BASE_PATH}/${resultId}/recalculate`,
      this.buildPayload(opts),
    );
    if (res.status !== 200) {
      throw new Error(`[OccurrenceService.recalculate] Expected 200, got ${res.status}`);
    }
    return this.parseResult(res.body);
  }

  /** Get an occurrence by its result_id. Returns 404 for dry-run results. */
  async getById(resultId: string): Promise<OccurrenceResult> {
    const res = await this.get<Record<string, unknown>>(`${BASE_PATH}/${resultId}`);
    if (res.status !== 200) {
      throw new Error(`[OccurrenceService.getById] Expected 200, got ${res.status}`);
    }
    return this.parseResult(res.body);
  }

  /** Get all occurrences for a transaction. */
  async getByTransaction(transactionId: string): Promise<OccurrenceResult[]> {
    const res = await this.get<Record<string, unknown>>(
      `${BASE_PATH}/bytransaction/${transactionId}`,
    );
    if (res.status !== 200) {
      throw new Error(`[OccurrenceService.getByTransaction] Expected 200, got ${res.status}`);
    }
    const items = (res.body['data'] as unknown[]) ?? [res.body];
    return items.map(i => this.parseResult(i as Record<string, unknown>));
  }

  /** Get all occurrences for a policy. */
  async getByPolicy(policyId: string): Promise<OccurrenceResult[]> {
    const res = await this.get<Record<string, unknown>>(
      `${BASE_PATH}/bypolicy/${policyId}`,
    );
    if (res.status !== 200) {
      throw new Error(`[OccurrenceService.getByPolicy] Expected 200, got ${res.status}`);
    }
    const items = (res.body['data'] as unknown[]) ?? [res.body];
    return items.map(i => this.parseResult(i as Record<string, unknown>));
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private buildPayload(opts: CalculateRequest): Record<string, unknown> {
    const attributes: Record<string, unknown> = {
      tenant_id:            opts.tenantId         ?? TENANT_ID,
      occurrence_id:        opts.occurrenceId     ?? uuid(),
      policy_id:            opts.policyId         ?? uuid(),
      transaction_id:       opts.transactionId    ?? uuid(),
      coverage_code:        opts.coverageCode,
      state_code:           opts.stateCode,
      product_code:         opts.productCode,
      line_of_business:     opts.lineOfBusiness,
      rate_plan_version_id: opts.versionId,
      effective_date:       opts.effectiveDate,
      expiration_date:      opts.expirationDate,
      base_exposure:        opts.baseExposure,
      base_rate:            opts.baseRate         ?? 1200,
      transaction_type:     opts.transactionType  ?? 'NewBusiness',
      is_dry_run:           opts.isDryRun         ?? false,
    };
    if (opts.extensionAttributes) {
      attributes['extension_attributes'] = opts.extensionAttributes;
    }
    return {
      data: {
        type: 'CalculateOccurrencePremiumRequest',
        attributes,
      },
    };
  }

  private parseResult(body: Record<string, unknown>): OccurrenceResult {
    // result_id lives directly on data, not inside data.attributes
    const d    = (body['data']       as Record<string, unknown>) ?? body;
    const attr = (d['attributes']    as Record<string, unknown>) ?? {};

    const num = (k: string): number =>
      Number(d[k] ?? attr[k] ?? body[k] ?? 0);
    const bool = (k: string): boolean =>
      Boolean(d[k] ?? attr[k] ?? body[k] ?? false);
    const str  = (k: string): string =>
      String(d[k] ?? attr[k] ?? body[k] ?? '');

    const arr = (k: string): unknown[] => {
      const v = d[k] ?? attr[k] ?? (body as Record<string, unknown>)[k];
      return Array.isArray(v) ? v : [];
    };

    return {
      resultId:              str('result_id'),
      policyId:              str('policy_id'),
      occurrenceId:          str('occurrence_id'),
      transactionId:         str('transaction_id'),
      finalPremium:          num('final_premium'),
      preRoundingPremium:    num('pre_rounding_premium'),
      isDryRun:              bool('is_dry_run'),
      isSuccess:             bool('is_success'),
      minimumPremiumApplied: bool('minimum_premium_applied'),
      yearDenominator:       num('year_denominator'),
      spansLeapDay:          bool('spans_leap_day'),
      termDays:              num('term_days'),
      ratePlanVersionId:     str('rate_plan_version_id'),
      supersededBy:          str('superseded_by'),
      factorsApplied:        arr('factors_applied'),
      rawBody:               body,
    };
  }
}

// ─── UUID helper ──────────────────────────────────────────────────────────────

function uuid(): string {
  const h4 = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  const h8 = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  const y  = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)];
  return `${h8()}-${h4()}-4${h4().slice(1)}-${y}${h4().slice(1)}-${h8()}${h4()}`;
}
