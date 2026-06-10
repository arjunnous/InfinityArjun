/**
 * services/common/BaseApiService.ts
 *
 * Base class for all Service Objects (API equivalent of Page Objects).
 *
 * Every API service extends this class and gets:
 *  - Typed get / post / patch / delete methods
 *  - Automatic JSON:API envelope wrapping / unwrapping
 *  - Consistent request/response logging (→ / ←) for evidence capture
 *  - Retry logic for 429 (rate-limit) and transient 422 errors
 *  - Normalised ApiResponse<T> return type
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';
import { createLogger } from '@core/logger';

const logger = createLogger('api');

// ─── Response envelope ────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  status:         number;
  body:           T;
  responseTimeMs: number;
  ok:             boolean;
}

// ─── JSON:API helpers ─────────────────────────────────────────────────────────

export function wrapJsonApi(type: string, attributes: Record<string, unknown>): Record<string, unknown> {
  return { data: { type, attributes } };
}

export function unwrapJsonApi<T>(body: Record<string, unknown>): T {
  const d = body['data'] as Record<string, unknown> | undefined;
  if (d?.['attributes']) return d['attributes'] as T;
  if (d) return d as T;
  return body as T;
}

// ─── Base service ─────────────────────────────────────────────────────────────

export abstract class BaseApiService {
  protected readonly request: APIRequestContext;
  protected readonly baseUrl: string;

  private static readonly JSONAPI_HEADERS = {
    'Content-Type': 'application/vnd.api+json',
    Accept:         'application/json',
  };

  constructor(request: APIRequestContext, baseUrl: string) {
    this.request = request;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // ── HTTP methods ─────────────────────────────────────────────────────────────

  protected async get<T = unknown>(
    path: string,
    params?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    const url = this.url(path, params);
    this.logRequest('GET', path);
    const res = await this.withRetry(() =>
      this.request.get(url, { headers: BaseApiService.JSONAPI_HEADERS, timeout: 60_000 }),
    );
    return this.parse<T>(res, 'GET', path);
  }

  protected async post<T = unknown>(
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const url = this.url(path);
    this.logRequest('POST', path, body);
    const res = await this.withRetry(() =>
      this.request.post(url, {
        data:    body,
        headers: BaseApiService.JSONAPI_HEADERS,
        timeout: 60_000,
      }),
    );
    return this.parse<T>(res, 'POST', path);
  }

  protected async patch<T = unknown>(
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const url = this.url(path);
    this.logRequest('PATCH', path, body);
    const res = await this.withRetry(() =>
      this.request.patch(url, {
        data:    body,
        headers: BaseApiService.JSONAPI_HEADERS,
        timeout: 60_000,
      }),
    );
    return this.parse<T>(res, 'PATCH', path);
  }

  protected async delete<T = unknown>(
    path: string,
  ): Promise<ApiResponse<T>> {
    const url = this.url(path);
    this.logRequest('DELETE', path);
    const res = await this.withRetry(() =>
      this.request.delete(url, { headers: BaseApiService.JSONAPI_HEADERS, timeout: 60_000 }),
    );
    return this.parse<T>(res, 'DELETE', path);
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private url(path: string, params?: Record<string, string>): string {
    const base = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    if (!params || Object.keys(params).length === 0) return base;
    const qs = new URLSearchParams(params).toString();
    return `${base}?${qs}`;
  }

  private logRequest(method: string, path: string, body?: unknown): void {
    logger.info(`-> ${method} ${path}`, body);
  }

  private async parse<T>(
    res: APIResponse,
    method: string,
    path: string,
  ): Promise<ApiResponse<T>> {
    const start  = Date.now();
    let body: T;
    try { body = await res.json() as T; } catch { body = null as T; }
    const responseTimeMs = Date.now() - start;

    logger.info(`<- ${res.status()} ${method} ${path}`, body);

    return {
      status:         res.status(),
      body,
      responseTimeMs,
      ok:             res.ok(),
    };
  }

  // ── Retry logic ───────────────────────────────────────────────────────────────

  private async withRetry(fn: () => Promise<APIResponse>): Promise<APIResponse> {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await fn();

      if (res.status() === 429) {
        logger.warn(`[retry] 429 rate-limit — attempt ${attempt}/5, waiting ${5 * attempt}s`);
        await sleep(5000 * attempt);
        continue;
      }

      if (res.status() === 422) {
        try {
          const b = await res.json() as Record<string, unknown>;
          const detail = String(b['detail'] ?? b['title'] ?? '').toLowerCase();
          if (detail.includes('transient')) {
            logger.warn(`[retry] 422 transient — attempt ${attempt}/5, waiting 15s`);
            await sleep(15_000);
            continue;
          }
        } catch { /* non-JSON 422 — return as-is */ }
      }

      return res;
    }
    return fn();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
