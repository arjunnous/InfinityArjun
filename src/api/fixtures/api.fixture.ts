// File: src/api/fixtures/api.fixture.ts

import { test as base, expect, APIRequestContext } from '@playwright/test';
import { getAuthToken, createApiClient } from '@utils/api-client';
import { resolveSecret } from '@utils/crypto-utils';

type ApiFixtures = {
  /** APIRequestContext pre-configured with admin Bearer token */
  apiClient: APIRequestContext;
};

export const test = base.extend<ApiFixtures>({
  apiClient: async ({ playwright }, use) => {
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) throw new Error('[apiClient] BASE_URL is not set.');

    const username = process.env.ADMIN_USERNAME;
    const rawPassword = process.env.ADMIN_PASSWORD;
    if (!username) throw new Error('[apiClient] ADMIN_USERNAME is not set.');
    if (!rawPassword) throw new Error('[apiClient] ADMIN_PASSWORD is not set.');

    const bootstrapCtx = await playwright.request.newContext({
      baseURL: baseUrl,
      extraHTTPHeaders: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });

    let client: APIRequestContext | null = null;
    try {
      const token = await getAuthToken(bootstrapCtx, baseUrl, {
        username,
        password: resolveSecret(rawPassword),
      });
      client = await createApiClient(bootstrapCtx, baseUrl, token);
      await use(client);
    } finally {
      await bootstrapCtx.dispose();
      if (client) await client.dispose();
    }
  },
});

export { expect };
