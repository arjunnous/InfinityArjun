// File: global-setup.ts

import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loadEnv, activeEnv } from './src/core/config/env';
import { resolveSecret } from './src/core/utils/crypto-utils';
import { AUTH_STORAGE_PATH, type Role } from './src/core/utils/rbac';

// Load shared secrets and overlay environment-specific config (.env.<TEST_ENV>)
loadEnv();

// ---------------------------------------------------------------------------
// Roles to pre-authenticate at setup time.
// viewer is optional — only created if VIEWER_USERNAME is set.
// ---------------------------------------------------------------------------
const ROLE_ENV_MAP: Array<{
  role: Role;
  usernameKey: string;
  passwordKey: string;
  required: boolean;
}> = [
  { role: 'admin',       usernameKey: 'ADMIN_USERNAME',       passwordKey: 'ADMIN_PASSWORD',       required: true  },
  { role: 'underwriter', usernameKey: 'UNDERWRITER_USERNAME', passwordKey: 'UNDERWRITER_PASSWORD', required: true  },
  { role: 'agent',       usernameKey: 'AGENT_USERNAME',       passwordKey: 'AGENT_PASSWORD',       required: true  },
  { role: 'viewer',      usernameKey: 'VIEWER_USERNAME',      passwordKey: 'VIEWER_PASSWORD',      required: false },
];

async function loginAndSave(
  role: Role,
  username: string,
  password: string,
  baseURL: string,
  authDir: string,
): Promise<void> {
  const storagePath = path.join(process.cwd(), AUTH_STORAGE_PATH[role]);

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });

  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  try {
    console.log(`[global-setup] Logging in as ${role} (${username}) …`);

    await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 });

    await page
      .locator('input[name="username"], input[id="username"], input[type="text"]')
      .first()
      .fill(username);

    await page
      .locator('input[name="password"], input[id="password"], input[type="password"]')
      .first()
      .fill(password);

    await page
      .locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")')
      .first()
      .click();

    await page.waitForURL(
      (url) => !url.toString().toLowerCase().includes('login'),
      { timeout: 60_000, waitUntil: 'networkidle' },
    );

    await context.storageState({ path: storagePath });
    console.log(`[global-setup] ✓ ${role} auth saved → ${AUTH_STORAGE_PATH[role]}`);
  } catch (error) {
    const screenshotPath = path.join(authDir, `login-failure-${role}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`[global-setup] ✗ Login failed for ${role}. Screenshot: ${screenshotPath}`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL = process.env.BASE_URL;
  if (!baseURL) {
    throw new Error('[global-setup] BASE_URL is not set in environment.');
  }

  const authDir = path.join(process.cwd(), '.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  for (const { role, usernameKey, passwordKey, required } of ROLE_ENV_MAP) {
    const username = process.env[usernameKey];
    const rawPassword = process.env[passwordKey];

    if (!username || !rawPassword) {
      if (required) {
        throw new Error(
          `[global-setup] Missing required credentials for role "${role}": ${usernameKey}, ${passwordKey}`,
        );
      }
      console.log(`[global-setup] Skipping optional role "${role}" — credentials not set.`);
      continue;
    }

    const password = resolveSecret(rawPassword);
    await loginAndSave(role, username, password, baseURL, authDir);
  }

  console.log(`[global-setup] All role auth states created for environment: ${activeEnv()}.`);
}

export default globalSetup;
