// File: utils/api-client.ts

import { APIRequestContext, request } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared response envelope
// ---------------------------------------------------------------------------

// Named distinctly from services/common/BaseApiService's `ApiResponse<T>` —
// that envelope carries `ok`; this one carries raw `headers` for measureRequest.
export interface MeasuredApiResponse<T> {
  status: number;
  body: T;
  responseTimeMs: number;
  headers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Internal shape returned by Playwright response objects
// ---------------------------------------------------------------------------

type PlaywrightResponse<T> = {
  status: () => number;
  json: () => Promise<T>;
  headers: () => Record<string, string>;
};

// ---------------------------------------------------------------------------
// getAuthToken
// ---------------------------------------------------------------------------

/**
 * Authenticate against the EAIS login endpoint and return a raw Bearer JWT.
 *
 * The function performs POST /api/auth/login with JSON credentials and
 * expects the server to return `{ token: string }` in the response body.
 *
 * @example
 *   const token = await getAuthToken(apiRequest, process.env.BASE_URL!, {
 *     username: process.env.ADMIN_USER!,
 *     password: process.env.ADMIN_PASS!,
 *   });
 */
export async function getAuthToken(
  apiRequest: APIRequestContext,
  baseUrl: string,
  credentials: { username: string; password: string },
): Promise<string> {
  const loginUrl = `${baseUrl.replace(/\/$/, '')}/api/auth/login`;

  const response = await apiRequest.post(loginUrl, {
    data: {
      username: credentials.username,
      password: credentials.password,
    },
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `[getAuthToken] Login failed — HTTP ${response.status()}: ${body}`,
    );
  }

  const body = await response.json() as { token?: string; access_token?: string };
  const token = body.token ?? body.access_token;

  if (!token) {
    throw new Error(
      '[getAuthToken] Response did not contain a "token" or "access_token" field.',
    );
  }

  return token;
}

// ---------------------------------------------------------------------------
// createApiClient
// ---------------------------------------------------------------------------

/**
 * Build a new Playwright APIRequestContext pre-configured with an
 * Authorization: Bearer header and JSON content negotiation headers.
 *
 * Callers are responsible for disposing the returned context when done:
 *   `await client.dispose();`
 *
 * @example
 *   const client = await createApiClient(apiRequest, process.env.BASE_URL!, token);
 *   const resp   = await client.get('/api/policies');
 *   await client.dispose();
 */
export async function createApiClient(
  _apiRequest: APIRequestContext,
  baseUrl: string,
  token: string,
): Promise<APIRequestContext> {
  // `request.newContext` creates a completely independent context so headers
  // are guaranteed not to bleed into other test contexts.
  const client = await request.newContext({
    baseURL: baseUrl.replace(/\/$/, ''),
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  return client;
}

// ---------------------------------------------------------------------------
// measureRequest
// ---------------------------------------------------------------------------

/**
 * Wrap any Playwright API call with wall-clock timing and normalize the
 * response into the `MeasuredApiResponse<T>` envelope.
 *
 * @example
 *   const result = await measureRequest<Policy[]>(
 *     () => client.get('/api/policies'),
 *   );
 *   console.log(result.responseTimeMs); // e.g. 142
 */
export async function measureRequest<T>(
  fn: () => Promise<PlaywrightResponse<T>>,
): Promise<MeasuredApiResponse<T>> {
  const start = Date.now();
  const response = await fn();
  const responseTimeMs = Date.now() - start;

  const status = response.status();
  const body = await response.json();
  const headers = response.headers();

  return { status, body, responseTimeMs, headers };
}
