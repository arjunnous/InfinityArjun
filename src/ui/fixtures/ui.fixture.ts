// File: src/ui/fixtures/ui.fixture.ts

import { test as base, expect, Page, Browser } from '@playwright/test';
import { TestDataFactory } from '@utils/test-data-factory';
import { AUTH_STORAGE_PATH, hasPermission, assertPermission, type Role, type Resource, type Action } from '@utils/rbac';

type UiFixtures = {
  /** Authenticated page for the admin role */
  adminPage: Page;

  /** Authenticated page for the underwriter role */
  underwriterPage: Page;

  /** Authenticated page for the agent/broker role */
  agentPage: Page;

  /** Authenticated page for the read-only viewer role */
  viewerPage: Page;

  /**
   * Default authenticated page (admin). Kept for backward compatibility.
   * Prefer role-specific fixtures in new tests.
   */
  authenticatedPage: Page;

  /** TestDataFactory class — buildRule/buildUser/etc. are static factory methods */
  testData: typeof TestDataFactory;

  /** RBAC helper scoped to a role — assert or check permissions inline */
  rbac: {
    role: Role;
    can: (resource: Resource, action: Action) => boolean;
    assert: (resource: Resource, action: Action) => void;
  };
};

async function roleAuthPage(browser: Browser, role: Role): Promise<Page> {
  const storagePath = AUTH_STORAGE_PATH[role];
  const context = await browser.newContext({
    storageState: storagePath,
    baseURL: process.env.BASE_URL,
    ignoreHTTPSErrors: true,
  });
  return context.newPage();
}

export const test = base.extend<UiFixtures>({

  // ── adminPage ─────────────────────────────────────────────────────────────
  adminPage: async ({ browser }, use) => {
    const page = await roleAuthPage(browser, 'admin');
    await use(page);
    await page.context().close();
  },

  // ── underwriterPage ──────────────────────────────────────────────────────
  underwriterPage: async ({ browser }, use) => {
    const page = await roleAuthPage(browser, 'underwriter');
    await use(page);
    await page.context().close();
  },

  // ── agentPage ─────────────────────────────────────────────────────────────
  agentPage: async ({ browser }, use) => {
    const page = await roleAuthPage(browser, 'agent');
    await use(page);
    await page.context().close();
  },

  // ── viewerPage ────────────────────────────────────────────────────────────
  viewerPage: async ({ browser }, use) => {
    const page = await roleAuthPage(browser, 'viewer');
    await use(page);
    await page.context().close();
  },

  // ── authenticatedPage — backward-compatible alias for adminPage ──────────
  authenticatedPage: async ({ browser }, use) => {
    const page = await roleAuthPage(browser, 'admin');
    await use(page);
    await page.context().close();
  },

  // ── testData ──────────────────────────────────────────────────────────────
  testData: async ({}, use) => {
    await use(TestDataFactory);
  },

  // ── rbac — defaults to admin role, override via test.use({ rbac }) ───────
  rbac: async ({}, use) => {
    const role: Role = 'admin';
    await use({
      role,
      can: (resource, action) => hasPermission(role, resource, action),
      assert: (resource, action) => assertPermission(role, resource, action),
    });
  },
});

export { expect };
