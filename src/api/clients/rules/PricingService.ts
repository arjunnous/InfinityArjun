/**
 * services/rules/PricingService.ts
 *
 * Service Object — Rules Engine: Pricing calculation endpoints (suite18187).
 *
 *   POST  /api/v1/rulesengine/pricing/calculate
 *   POST  /api/v1/rulesengine/pricing/recalculate
 *   GET   /api/v1/rulesengine/pricing/results/{policyId}
 *   GET   /api/v1/rulesengine/pricing/results/{policyId}/{coverageCode}/latest
 *   GET   /api/v1/rulesengine/pricing/results/{resultId}/trace
 */

import type { APIRequestContext } from '@playwright/test';
import { BaseApiService }         from '@services/common/BaseApiService';
import * as crypto                from 'crypto';

export interface CalculatePricingRequest {
  policyId?:        string;
  coverageCode?:    string;
  transactionType?: string;
  effectiveDate?:   string;
  expirationDate?:  string;
  inputData?:       Record<string, unknown>;
  tenantId?:        string;
}

export interface LineItem {
  ruleCode:      string;
  itemType:      string;   // 'RATE' | 'MOD' | 'DISC' | 'FEE' | 'TAX' | 'SURCH'
  amount:        number;
  sequenceOrder: number;
  rawBody:       unknown;
}

export interface PricingResult {
  resultId:        string;
  policyId:        string;
  coverageCode:    string;
  basePremium:     number;
  finalPremium:    number;
  totalModifiers:  number;
  totalFees:       number;
  isSuperseded:    boolean;
  supersededById:  string;
  lineItems:       LineItem[];
  rawBody:         unknown;
}

export interface TraceResult {
  resultId:     string;
  inputsJson:   unknown;
  outputsJson:  unknown;
  rulesApplied: unknown[];
  executionMs:  number;
  rawBody:      unknown;
}

const BASE   = '/api/v1/rulesengine/pricing';
const TENANT = process.env['TENANT_ID'] ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

export class PricingService extends BaseApiService {

  constructor(request: APIRequestContext, baseUrl: string) {
    super(request, baseUrl);
  }

  /** Calculate premium for a policy/coverage. Returns a new PricingResult. */
  async calculate(opts?: CalculatePricingRequest): Promise<PricingResult> {
    const policyId = opts?.policyId ?? uuid();
    const res = await this.post<Record<string, unknown>>(`${BASE}/calculate`, {
      policy_id:        policyId,
      coverage_code:    opts?.coverageCode    ?? 'BI',
      transaction_type: opts?.transactionType ?? 'NewBusiness',
      effective_date:   opts?.effectiveDate   ?? today(),
      expiration_date:  opts?.expirationDate  ?? nextYear(),
      input_data:       opts?.inputData       ?? {},
      tenant_id:        opts?.tenantId        ?? TENANT,
    });

    if (![200, 201].includes(res.status)) {
      throw new Error(`[PricingService.calculate] Expected 200/201, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return this.parseResult(res.body);
  }

  /** Recalculate — creates a new result, marks prior as superseded. */
  async recalculate(opts?: CalculatePricingRequest): Promise<PricingResult> {
    const res = await this.post<Record<string, unknown>>(`${BASE}/recalculate`, {
      policy_id:        opts?.policyId        ?? uuid(),
      coverage_code:    opts?.coverageCode    ?? 'BI',
      transaction_type: opts?.transactionType ?? 'NewBusiness',
      effective_date:   opts?.effectiveDate   ?? today(),
      expiration_date:  opts?.expirationDate  ?? nextYear(),
      input_data:       opts?.inputData       ?? {},
      tenant_id:        opts?.tenantId        ?? TENANT,
    });

    if (![200, 201].includes(res.status)) {
      throw new Error(`[PricingService.recalculate] Expected 200/201, got ${res.status}`);
    }
    return this.parseResult(res.body);
  }

  /** Get all pricing results for a policy. */
  async getByPolicy(policyId: string): Promise<PricingResult[]> {
    const res = await this.get<Record<string, unknown>>(
      `${BASE}/results/${policyId}`,
    );
    if (res.status !== 200) {
      throw new Error(`[PricingService.getByPolicy] Expected 200, got ${res.status}`);
    }
    return this.flatList(res.body).map(i => this.parseResult(i));
  }

  /** Get the latest pricing result for a policy + coverage. */
  async getLatest(policyId: string, coverageCode: string): Promise<PricingResult> {
    const res = await this.get<Record<string, unknown>>(
      `${BASE}/results/${policyId}/${coverageCode}/latest`,
    );
    if (res.status !== 200) {
      throw new Error(`[PricingService.getLatest] Expected 200, got ${res.status}`);
    }
    return this.parseResult(res.body);
  }

  /** Get the execution trace for a result — inputs, outputs, rules applied. */
  async getTrace(resultId: string): Promise<TraceResult> {
    const res = await this.get<Record<string, unknown>>(
      `${BASE}/results/${resultId}/trace`,
    );
    if (res.status !== 200) {
      throw new Error(`[PricingService.getTrace] Expected 200, got ${res.status}`);
    }
    const b = res.body;
    return {
      resultId:    String(b['result_id']    ?? resultId),
      inputsJson:  b['inputs_json']          ?? null,
      outputsJson: b['outputs_json']         ?? null,
      rulesApplied: (b['rules_applied'] as unknown[]) ?? [],
      executionMs: Number(b['execution_ms'] ?? 0),
      rawBody:     b,
    };
  }

  private parseResult(body: Record<string, unknown>): PricingResult {
    const d    = (body['data']       as Record<string, unknown>) ?? body;
    const attr = (d['attributes']    as Record<string, unknown>) ?? d;
    const str  = (k: string) => String(attr[k] ?? d[k] ?? body[k] ?? '');
    const num  = (k: string) => Number(attr[k] ?? d[k] ?? body[k] ?? 0);
    const bool = (k: string) => Boolean(attr[k] ?? d[k] ?? body[k] ?? false);

    const rawItems = (attr['line_items'] ?? d['line_items'] ?? []) as unknown[];
    const lineItems: LineItem[] = (rawItems).map((i: unknown) => {
      const item = i as Record<string, unknown>;
      return {
        ruleCode:      String(item['rule_code']      ?? ''),
        itemType:      String(item['item_type']       ?? ''),
        amount:        Number(item['amount']           ?? 0),
        sequenceOrder: Number(item['sequence_order']  ?? 0),
        rawBody:       item,
      };
    });

    return {
      resultId:       str('result_id'),
      policyId:       str('policy_id'),
      coverageCode:   str('coverage_code'),
      basePremium:    num('base_premium'),
      finalPremium:   num('final_premium'),
      totalModifiers: num('total_modifiers'),
      totalFees:      num('total_fees'),
      isSuperseded:   bool('is_superseded'),
      supersededById: str('superseded_by_id'),
      lineItems,
      rawBody:        body,
    };
  }

  private flatList(body: Record<string, unknown>): Record<string, unknown>[] {
    if (Array.isArray(body))            return body as Record<string, unknown>[];
    if (Array.isArray(body['data']))    return body['data']    as Record<string, unknown>[];
    if (Array.isArray(body['items']))   return body['items']   as Record<string, unknown>[];
    if (Array.isArray(body['results'])) return body['results'] as Record<string, unknown>[];
    return [];
  }
}

function uuid(): string {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function today(): string    { return new Date().toISOString().slice(0, 10); }
function nextYear(): string {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
