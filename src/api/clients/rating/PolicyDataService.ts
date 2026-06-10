/**
 * services/rating/PolicyDataService.ts
 *
 * Service Object — Rating Engine: Policy Data Repository endpoints (suite20009).
 *
 *   GET /api/v1/rating/policydata/snapshot/{executionId}
 *   GET /api/v1/rating/policydata/{policyId}/accesslogs
 *   GET /api/v1/rating/policydata/accesslogs/search
 *   GET /api/v1/rating/policydata/accesslogs/export
 */

import type { APIRequestContext } from '@playwright/test';
import { BaseApiService }         from '@services/common/BaseApiService';

export interface SnapshotResult {
  executionId:   string;
  policyId:      string;
  snapshotData:  unknown;
  capturedAt:    string;
  latencyMs:     number;
  rawBody:       unknown;
}

export interface AccessLogEntry {
  id:          string;
  policyId:    string;
  accessedAt:  string;
  accessedBy:  string;
  action:      string;
  rawBody:     unknown;
}

export interface SearchParams {
  policyId?:   string;
  fromDate?:   string;
  toDate?:     string;
  pageSize?:   number;
  pageNumber?: number;
}

const BASE = '/api/v1/rating/policydata';

export class PolicyDataService extends BaseApiService {

  constructor(request: APIRequestContext, baseUrl: string) {
    super(request, baseUrl);
  }

  /** Get immutable snapshot for a given executionId (result_id from /occurrences/calculate). */
  async getSnapshot(executionId: string, effectiveDate?: string): Promise<SnapshotResult> {
    const params: Record<string, string> = {};
    if (effectiveDate) params['effectiveDate'] = effectiveDate;

    const start = Date.now();
    const res   = await this.get<Record<string, unknown>>(
      `${BASE}/snapshot/${executionId}`,
      params,
    );
    if (res.status !== 200) {
      throw new Error(`[PolicyDataService.getSnapshot] Expected 200, got ${res.status}`);
    }
    const latencyMs = Date.now() - start;
    const body      = res.body;
    const data      = (body['data'] as Record<string, unknown>) ?? body;
    const attrs     = (data['attributes'] as Record<string, unknown>) ?? data;

    return {
      executionId:  String(attrs['execution_id']  ?? executionId),
      policyId:     String(attrs['policy_id']      ?? ''),
      snapshotData: attrs['snapshot_data']          ?? body,
      capturedAt:   String(attrs['captured_at']    ?? ''),
      latencyMs,
      rawBody:      body,
    };
  }

  /** Get access log entries for a policy. */
  async getAccessLogs(policyId: string, params?: SearchParams): Promise<AccessLogEntry[]> {
    const q: Record<string, string> = {};
    if (params?.fromDate)   q['fromDate']     = params.fromDate;
    if (params?.toDate)     q['toDate']       = params.toDate;
    if (params?.pageSize)   q['page[size]']   = String(params.pageSize);
    if (params?.pageNumber) q['page[number]'] = String(params.pageNumber);

    const res = await this.get<Record<string, unknown>>(
      `${BASE}/${policyId}/accesslogs`,
      q,
    );
    if (res.status !== 200) {
      throw new Error(`[PolicyDataService.getAccessLogs] Expected 200, got ${res.status}`);
    }
    return this.parseLogs(res.body);
  }

  /** Search access logs across all policies with optional filters. */
  async searchAccessLogs(params?: SearchParams): Promise<AccessLogEntry[]> {
    const q: Record<string, string> = {};
    if (params?.policyId)   q['policyId']     = params.policyId;
    if (params?.fromDate)   q['fromDate']     = params.fromDate;
    if (params?.toDate)     q['toDate']       = params.toDate;
    if (params?.pageSize)   q['page[size]']   = String(params.pageSize);
    if (params?.pageNumber) q['page[number]'] = String(params.pageNumber);

    const res = await this.get<Record<string, unknown>>(
      `${BASE}/accesslogs/search`,
      q,
    );
    if (res.status !== 200) {
      throw new Error(`[PolicyDataService.searchAccessLogs] Expected 200, got ${res.status}`);
    }
    return this.parseLogs(res.body);
  }

  /** Export access logs (returns CSV or JSON depending on server config). */
  async exportAccessLogs(params?: SearchParams): Promise<{ contentType: string; rawBody: unknown }> {
    const q: Record<string, string> = {};
    if (params?.fromDate) q['fromDate'] = params.fromDate;
    if (params?.toDate)   q['toDate']   = params.toDate;

    const res = await this.get<unknown>(`${BASE}/accesslogs/export`, q);
    if (res.status !== 200) {
      throw new Error(`[PolicyDataService.exportAccessLogs] Expected 200, got ${res.status}`);
    }
    return { contentType: 'application/json', rawBody: res.body };
  }

  private parseLogs(body: Record<string, unknown>): AccessLogEntry[] {
    const items: unknown[] = Array.isArray(body)
      ? body
      : Array.isArray(body['data'])    ? body['data']    as unknown[]
      : Array.isArray(body['items'])   ? body['items']   as unknown[]
      : Array.isArray(body['results']) ? body['results'] as unknown[]
      : [];

    return items.map((i: unknown) => {
      const entry = i as Record<string, unknown>;
      return {
        id:         String(entry['id']          ?? ''),
        policyId:   String(entry['policy_id']   ?? ''),
        accessedAt: String(entry['accessed_at'] ?? ''),
        accessedBy: String(entry['accessed_by'] ?? ''),
        action:     String(entry['action']       ?? ''),
        rawBody:    entry,
      };
    });
  }
}
