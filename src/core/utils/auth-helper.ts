// File: helpers/auth-helper.ts

import type { Page, APIRequestContext } from '@playwright/test';
import { LoginPage } from '@pages/common/LoginPage';
import { TestDataFactory } from '@utils/test-data-factory';
import { getAuthToken } from '@utils/api-client';
import { resolveSecret } from '@utils/crypto-utils';
import type { Role } from '@utils/rbac';
import { config } from '@config/project.config';
import { requireEnv } from '@core/config/env';

// ---------------------------------------------------------------------------
// Module-level token cache
// Role key → { token, expiresAt }
// ---------------------------------------------------------------------------

interface CachedToken {
  token: string;
  /** Timestamp (ms since epoch) after which the token should be refreshed */
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

/** How long (in ms) a cached token is considered valid.  Default: 55 minutes. */
const TOKEN_TTL_MS = 55 * 60 * 1_000;

// ---------------------------------------------------------------------------
// loginAs
// ---------------------------------------------------------------------------

/**
 * Perform a full browser login for the given role.
 *
 * Reads credentials via TestDataFactory.buildUser(role) which sources them
 * from the ADMIN_USERNAME / UNDERWRITER_USERNAME / AGENT_USERNAME (and
 * corresponding PASSWORD) environment variables.
 *
 * After successful login the function waits for the Dashboard heading to
 * confirm the application shell is ready.
 *
 * @param page  - Playwright Page to operate on.
 * @param role  - 'admin' | 'underwriter' | 'agent'
 */
export async function loginAs(
  page: Page,
  role: Role,
): Promise<void> {
  const credentials = TestDataFactory.buildUser(role);

  await page.goto(config.api.baseUrl, { waitUntil: 'domcontentloaded' });

  const loginPage = new LoginPage(page);

  await loginPage.fillUsername(credentials.username);
  await loginPage.fillPassword(credentials.password);
  await loginPage.clickSignIn();
  await loginPage.waitForDashboard();
}

// ---------------------------------------------------------------------------
// ensureLoggedIn
// ---------------------------------------------------------------------------

/**
 * Check whether the current page session is still authenticated by looking
 * for the Dashboard heading.  If it is not visible (e.g. the session expired
 * or the page was navigated away), re-authenticate as admin.
 *
 * The admin role is used for re-authentication because it is the only role
 * whose credentials are required by global-setup.  Override the behaviour by
 * calling loginAs() directly with a specific role when needed.
 *
 * @param page - Playwright Page to check and, if necessary, re-authenticate.
 */
export async function ensureLoggedIn(page: Page): Promise<void> {
  const loginPage = new LoginPage(page);

  const isDashboardVisible = await loginPage.dashboardIndicator
    .isVisible()
    .catch(() => false);

  if (!isDashboardVisible) {
    console.log('[ensureLoggedIn] Dashboard not visible — re-authenticating as admin.');
    await loginAs(page, 'admin');
  }
}

// ---------------------------------------------------------------------------
// getValidToken
// ---------------------------------------------------------------------------

/**
 * Return a valid Bearer token for the admin account.
 *
 * Tokens are cached in the module-level `tokenCache` Map keyed by role.
 * A cached entry is reused until it is within TOKEN_TTL_MS of expiry, after
 * which a fresh token is obtained from the /api/auth/login endpoint.
 *
 * Required environment variables:
 *   ADMIN_PASSWORD
 *
 * @param request - Playwright APIRequestContext used for the token exchange.
 * @returns       - Raw JWT string suitable for use as a Bearer token.
 */
export async function getValidToken(request: APIRequestContext): Promise<string> {
  const cacheKey = 'admin';
  const now = Date.now();

  const cached = tokenCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.token;
  }

  const password = requireEnv('ADMIN_PASSWORD');

  const token = await getAuthToken(request, config.api.baseUrl, {
    username: config.users.admin.username,
    password: resolveSecret(password),
  });

  tokenCache.set(cacheKey, {
    token,
    expiresAt: now + TOKEN_TTL_MS,
  });

  return token;
}
