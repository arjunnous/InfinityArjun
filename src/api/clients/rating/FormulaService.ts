/**
 * services/rating/FormulaService.ts
 *
 * Service Object — Rating Engine: Formula Extract endpoints (suite18304).
 *
 *   GET /api/v1/rating/formulas/extract          → JSON formula list
 *   GET /api/v1/rating/formulas/extract/excel    → Excel binary
 *   GET /api/v1/rating/formulas/extract/pdf      → PDF binary
 *   GET /api/v1/rating/formulas/exports          → export history list
 */

import type { APIRequestContext } from '@playwright/test';
import { BaseApiService }         from '@services/common/BaseApiService';

export interface FormulaExtractParams {
  ratePlanVersionId?: string;
  tenantId?:          string;
  statusFilter?:      string;
  pageSize?:          number;
  pageNumber?:        number;
}

export interface FormulaRecord {
  ratePlanVersionId: string;
  versionId:         string;
  id:                string;
  effectiveFrom:     string;
  tenantId:          string;
  rawBody:           unknown;
}

export interface FormulaExtractResult {
  formulas:      FormulaRecord[];
  totalVersions: number;
  statusFilter:  string;
  tenantId:      string;
  rawBody:       unknown;
}

export interface ExportRecord {
  id:          string;
  format:      string;
  createdAt:   string;
  downloadUrl: string;
  rawBody:     unknown;
}

const BASE = '/api/v1/rating/formulas';

export class FormulaService extends BaseApiService {

  constructor(request: APIRequestContext, baseUrl: string) {
    super(request, baseUrl);
  }

  /** Extract formulas as JSON. Returns structured list with formula records. */
  async extract(params?: FormulaExtractParams): Promise<FormulaExtractResult> {
    const q: Record<string, string> = {};
    if (params?.ratePlanVersionId) q['ratePlanVersionId'] = params.ratePlanVersionId;
    if (params?.tenantId)          q['tenantId']          = params.tenantId;
    if (params?.statusFilter)      q['statusFilter']       = params.statusFilter;
    if (params?.pageSize)          q['page[size]']         = String(params.pageSize);
    if (params?.pageNumber)        q['page[number]']       = String(params.pageNumber);

    const res = await this.get<Record<string, unknown>>(`${BASE}/extract`, q);
    if (res.status !== 200) {
      throw new Error(`[FormulaService.extract] Expected 200, got ${res.status}`);
    }
    return this.parseExtract(res.body);
  }

  /** Download formulas as Excel binary. Returns the raw response body (Buffer). */
  async extractExcel(params?: FormulaExtractParams): Promise<{ contentType: string; size: number }> {
    const q: Record<string, string> = {};
    if (params?.ratePlanVersionId) q['ratePlanVersionId'] = params.ratePlanVersionId;
    if (params?.tenantId)          q['tenantId']          = params.tenantId;

    const res = await this.get<unknown>(`${BASE}/extract/excel`, q);
    if (res.status !== 200) {
      throw new Error(`[FormulaService.extractExcel] Expected 200, got ${res.status}`);
    }
    return { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 0 };
  }

  /** Download formulas as PDF binary. */
  async extractPdf(params?: FormulaExtractParams): Promise<{ contentType: string; size: number }> {
    const q: Record<string, string> = {};
    if (params?.ratePlanVersionId) q['ratePlanVersionId'] = params.ratePlanVersionId;
    if (params?.tenantId)          q['tenantId']          = params.tenantId;

    const res = await this.get<unknown>(`${BASE}/extract/pdf`, q);
    if (res.status !== 200) {
      throw new Error(`[FormulaService.extractPdf] Expected 200, got ${res.status}`);
    }
    return { contentType: 'application/pdf', size: 0 };
  }

  /** Get export history list. */
  async getExports(): Promise<ExportRecord[]> {
    const res = await this.get<Record<string, unknown>>(`${BASE}/exports`);
    if (res.status !== 200) {
      throw new Error(`[FormulaService.getExports] Expected 200, got ${res.status}`);
    }
    const items = this.flatList(res.body);
    return items.map(i => ({
      id:          String(i['id']           ?? ''),
      format:      String(i['format']        ?? ''),
      createdAt:   String(i['created_at']    ?? ''),
      downloadUrl: String(i['download_url']  ?? ''),
      rawBody:     i,
    }));
  }

  private parseExtract(body: Record<string, unknown>): FormulaExtractResult {
    const data  = (body['data']  as Record<string, unknown>) ?? body;
    const attrs = (data['attributes'] as Record<string, unknown>) ?? data;
    const rawFormulas = (attrs['formulas'] as unknown[]) ?? [];

    const formulas: FormulaRecord[] = rawFormulas.map((f: unknown) => {
      const fo = f as Record<string, unknown>;
      return {
        ratePlanVersionId: String(fo['rate_plan_version_id'] ?? ''),
        versionId:         String(fo['version_id']           ?? fo['id'] ?? ''),
        id:                String(fo['id']                   ?? ''),
        effectiveFrom:     String(fo['effective_from']        ?? ''),
        tenantId:          String(fo['tenant_id']             ?? ''),
        rawBody:           fo,
      };
    });

    return {
      formulas,
      totalVersions: Number(attrs['total_versions']  ?? formulas.length),
      statusFilter:  String(attrs['status_filter']   ?? ''),
      tenantId:      String(attrs['tenant_id']        ?? ''),
      rawBody:       body,
    };
  }

  private flatList(body: Record<string, unknown>): Record<string, unknown>[] {
    if (Array.isArray(body))           return body as Record<string, unknown>[];
    if (Array.isArray(body['data']))   return body['data']    as Record<string, unknown>[];
    if (Array.isArray(body['items']))  return body['items']   as Record<string, unknown>[];
    if (Array.isArray(body['results']))return body['results'] as Record<string, unknown>[];
    return [];
  }
}
