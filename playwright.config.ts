// File: playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import { config } from './src/config/project.config';

export default defineConfig({
  testDir: './tests',

  /* Maximum time one test can run — extended to accommodate 429 retry backoff (up to 24s) */
  timeout: 120_000,

  /* Maximum time the expect() assertions can wait */
  expect: {
    timeout: 10_000,
  },

  /* Retry once on CI !, no retries locally  for retrying the tc*/ 
  retries: process.env.CI ? 1 : 1,

  /* Opt out of parallel tests on CI — safe on local */
  workers: process.env.CI ? 2 : undefined,

  /* Reporters */
  reporter: [
    ['list'],
    // ADO Test Case reporter — shows ADO ID, TC tag, title, status, duration, error
    ['./integrations/ado/reporters/ado-tc-reporter.ts'],
    // Report archiver — auto-saves timestamped folder + ZIP in reports/ after every run
    // Works for all existing and future suites — no manual steps needed
    ['./integrations/ado/reporters/report-archiver.ts'],
    [
      'junit',
      {
        outputFile: 'test-results/reports/junit-results.xml',
        suiteName: 'Insurity EAIS Automation',
      },
    ],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  /* Shared browser options */
  use: {
    baseURL: config.api.baseUrl,

    /* Screenshots only on failure */
    screenshot: 'only-on-failure',

    /* Traces collected on first retry */
    trace: 'on-first-retry',

    /* Keep navigation timeouts reasonable */
    navigationTimeout: 30_000,
    actionTimeout: 15_000,

    /* Browser launch args for CI stability */
    launchOptions: {
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    },
  },

  /* Global setup — disabled until authentication is implemented */
  // globalSetup: './global-setup.ts',

  /* Output directory for test artifacts */
  outputDir: 'test-results/traces',

  /* ─── Projects ─────────────────────────────────────────────────── */
  projects: [
    // ── Pod 3 — Rules Engine (all pod3 tests) ────────────────────
    {
      name: 'pod3-rules',
      testMatch: '**/tests/pod3-rules/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: '.auth/user.json',
      },
    },

    // ── Pod 3 — Suite 18178 (API First Rule Integration lifecycle)
    {
      name: 'pod3-suite-18178',
      testMatch: '**/tests/pod3-rules/api/suite18178.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },

    // ── Pod 3 — Suite 18180 (US-4.2 Separation of Rules — Rule Deployment API)
    {
      name: 'pod3-suite-18180',
      testMatch: '**/tests/pod3-rules/api/suite18180.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },

    // ── Pod 3 — Suite 18186 (US-4.3 Audit Log, Version History & Rollback)
    {
      name: 'pod3-suite-18186',
      testMatch: '**/tests/pod3-rules/api/suite18186.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },

    // ── Pod 3 — Suite 18181 (US-4.3 Flexible Data Model Support)
    {
      name: 'pod3-suite-18181',
      testMatch: '**/tests/pod3-rules/api/suite18181.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },

    // ── Pod 3 — Suite 18187 (US-13.1 Base Premium Calculation)
    {
      name: 'pod3-suite-18187',
      testMatch: '**/tests/pod3-rules/api/suite18187.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },

    // ── Pod 3 — Suite 18191 (US-3.1 Real Time Rule Execution — Rules Engine)
    {
      name: 'pod3-suite-18191',
      testMatch: '**/tests/pod3-rules/api/suite18191.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },

    // ── Pod 3 — Suite 20009 (Policy Data Repository Access — Real-Time API)
    {
      name: 'pod3-suite-20009',
      testMatch: '**/tests/pod3-rating/api/suite20009.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: process.env.RATING_ENGINE_URL, storageState: undefined },
    },

    // ── Rate Plan Lifecycle Demo (utility smoke test)
    {
      name: 'lifecycle-demo',
      testMatch: '**/suite18303-lifecycle-demo.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: process.env.RATING_ENGINE_URL, storageState: undefined },
    },

    // ── Pod 3 — Suite 18304 (Extract Rating Formulas and Algorithms — Rating Engine)
    {
      name: 'pod3-suite-18304',
      testMatch: '**/tests/pod3-rating/api/suite18304.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: process.env.RATING_ENGINE_URL, storageState: undefined },
    },

    // ── Pod 3 — Suite 18303 (Rate Plan Versioning Lifecycle — Rating Engine)
    {
      name: 'pod3-suite-18303',
      testMatch: '**/tests/pod3-rating/api/suite18303.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: process.env.RATING_ENGINE_URL, storageState: undefined },
    },

    // ── Pod 3 — Suite 18177 (Leap Year Calculation — Rating Engine)
    {
      name: 'pod3-suite-18177',
      testMatch: '**/tests/pod3-rating/api/suite18177.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: process.env.RATING_ENGINE_URL, storageState: undefined },
    },

    // ── Pod 3 — Suite 18307 (RT-21.1 External System Integration — Rating Engine M2M)
    {
      name: 'pod3-suite-18307',
      testMatch: '**/tests/pod3-rating/api/suite18307.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        baseURL: config.api.ratingEngineUrl,
      },
    },

    // ── Pod 3 — Suite 19725 (FSD 21.3 RESTful APIs and Backward Compatibility)
    {
      name: 'pod3-suite-19725',
      testMatch: '**/tests/pod3-rules/api/suite19725.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        baseURL: config.api.rulesUrl,
      },
    },

    // ── Pod 3 — Rating Engine suites (all files directly under pod3-rating/)
    //    Base URL: RATING_ENGINE_URL (dedicated RT service — must differ from RULES_URL)
    {
      name: 'pod3-suite-18306',
      testMatch: '**/tests/pod3-rating/api/suite18306.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        baseURL: config.api.ratingEngineUrl,
      },
    },

    // ── Smoke — cross-pod, tagged @smoke ─────────────────────────
    {
      name: 'smoke',
      grep: /@smoke/,
      testMatch: '**/tests/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: '.auth/user.json',
      },
    },
  ],
});
