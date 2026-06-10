# EAIS Automation Framework – Intern Onboarding Guide

> **Goal**: By the end of this guide, you will be able to set up the framework, run tests, write new tests, and push results — all without asking anyone for help.

---

## Table of Contents

1. [What Is This Project?](#1-what-is-this-project)
2. [Prerequisites – Install These First](#2-prerequisites--install-these-first)
3. [Clone and Open the Project](#3-clone-and-open-the-project)
4. [Install Dependencies](#4-install-dependencies)
5. [Configure Environment Variables](#5-configure-environment-variables)
6. [Run Your First Test](#6-run-your-first-test)
7. [Project Structure Explained](#7-project-structure-explained)
8. [How to Write a New Test](#8-how-to-write-a-new-test)
9. [Page Object Model (POM) – How It Works](#9-page-object-model-pom--how-it-works)
10. [Helpers – Multi-Step Workflows](#10-helpers--multi-step-workflows)
11. [Test Data – Factories and Fixtures](#11-test-data--factories-and-fixtures)
12. [Running Tests by Environment and Pod](#12-running-tests-by-environment-and-pod)
13. [Generating and Viewing Reports](#13-generating-and-viewing-reports)
14. [Azure DevOps Integration](#14-azure-devops-integration)
15. [CI/CD Pipeline Overview](#15-cicd-pipeline-overview)
16. [Troubleshooting Common Issues](#16-troubleshooting-common-issues)
17. [Coding Standards and Conventions](#17-coding-standards-and-conventions)
18. [Quick Reference – All NPM Scripts](#18-quick-reference--all-npm-scripts)

---

## 1. What Is This Project?

This is the **Insurity Enterprise AI Suite (EAIS) Test Automation Framework**. It automates end-to-end testing for the insurance software module called "Pod 3":

| Pod | Name | What It Does |
|-----|------|--------------|
| Pod 3 | Rules & Rating Engine | Business rule evaluation and premium calculations |

**Technology stack:**
- [Playwright](https://playwright.dev/) — browser automation and test runner
- TypeScript — typed JavaScript
- Allure — rich HTML test reports
- PostgreSQL — database tests
- Azure DevOps (ADO) — test case management and results upload

---

## 2. Prerequisites – Install These First

Work through each item below in order. Do not skip any.

### 2.1 Node.js (v18 or higher)

1. Go to [https://nodejs.org](https://nodejs.org) and download the **LTS** version.
2. Run the installer. Accept all defaults.
3. Verify installation — open a **new** terminal (PowerShell or CMD) and run:
   ```
   node --version
   npm --version
   ```
   You should see version numbers like `v18.x.x` and `10.x.x`.

### 2.2 Git

1. Go to [https://git-scm.com/download/win](https://git-scm.com/download/win) and download Git for Windows.
2. Run the installer. Accept all defaults.
3. Verify:
   ```
   git --version
   ```
   You should see `git version 2.x.x`.

### 2.3 Visual Studio Code

1. Go to [https://code.visualstudio.com](https://code.visualstudio.com) and download VS Code.
2. Run the installer. Accept all defaults.
3. Open VS Code and install these extensions (press `Ctrl+Shift+X` to open Extensions):
   - **Playwright Test for VSCode** (by Microsoft)
   - **ESLint** (by Microsoft)
   - **Prettier – Code formatter** (by Prettier)
   - **TypeScript + JavaScript** (built in, but verify it is enabled)

### 2.4 PostgreSQL Client (Optional – only needed for DB tests)

1. Download [pgAdmin 4](https://www.pgadmin.org/download/) or [DBeaver](https://dbeaver.io/download/).
2. You do not need a local PostgreSQL server — the test framework connects to a remote database.

---

## 3. Clone and Open the Project

### 3.1 Clone the Repository

Open PowerShell and run:

```powershell
cd C:\Users\<your-username>\Downloads
git clone <repository-url> EAIS_Automation
cd EAIS_Automation
```

> Ask your team lead for the `<repository-url>`.

### 3.2 Open in VS Code

```powershell
code .
```

VS Code opens the project. You may see a popup asking to install recommended extensions — click **Install All**.

---

## 4. Install Dependencies

In the VS Code terminal (`` Ctrl+` `` to open it), run:

```powershell
npm ci
```

This installs all packages listed in `package-lock.json` exactly. Do **not** use `npm install` — it may change lock file versions.

### 4.1 Install Playwright Browsers

```powershell
npx playwright install chromium
```

This downloads the Chromium browser that Playwright uses for testing.

You should see output ending with:
```
✓ chromium 123.x.x installed
```

---

## 5. Configure Environment Variables

The framework needs credentials, URLs, and keys that are stored in environment files — **never hardcoded in test files**.

### 5.1 Create Your `.env` File

1. In the project root, find the file `.env.example` (if it does not exist, ask your team lead for it).
2. Copy it and rename the copy to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
3. Open `.env` in VS Code and fill in the values. Here is what each variable means:

```dotenv
# ─────────────────────────────────────────────────────────────
# Application Environment
# ─────────────────────────────────────────────────────────────
TEST_ENV=qa                        # Use 'qa' for QA environment or 'staging' for staging

# ─────────────────────────────────────────────────────────────
# Application URLs
# ─────────────────────────────────────────────────────────────
BASE_URL=https://eais-qa.example.com          # Main application URL
API_BASE_URL=https://eais-api-qa.example.com  # API base URL

# ─────────────────────────────────────────────────────────────
# User Credentials (4 roles are pre-configured)
# ─────────────────────────────────────────────────────────────
ADMIN_USERNAME=admin@example.com
ADMIN_PASSWORD=YourAdminPassword

UNDERWRITER_USERNAME=uw@example.com
UNDERWRITER_PASSWORD=YourUWPassword

AGENT_USERNAME=agent@example.com
AGENT_PASSWORD=YourAgentPassword

VIEWER_USERNAME=viewer@example.com
VIEWER_PASSWORD=YourViewerPassword

# ─────────────────────────────────────────────────────────────
# Encryption Key (for encrypted credentials)
# ─────────────────────────────────────────────────────────────
ENCRYPTION_KEY=<32-character-key-from-team-lead>

# ─────────────────────────────────────────────────────────────
# Database (PostgreSQL)
# ─────────────────────────────────────────────────────────────
DB_HOST=db.qa.example.com
DB_PORT=5432
DB_NAME=eais_qa
DB_USER=testuser
DB_PASSWORD=YourDBPassword

# ─────────────────────────────────────────────────────────────
# Azure DevOps (ADO) Integration
# ─────────────────────────────────────────────────────────────
ADO_ORG_URL=https://dev.azure.com/your-org
ADO_PAT=<personal-access-token-from-team-lead>
ADO_PROJECT=EAIS

ADO_PLAN_ID_POD3=1003

ADO_SUITE_ID_POD3=2003

# ─────────────────────────────────────────────────────────────
# Microsoft Teams Notifications
# ─────────────────────────────────────────────────────────────
TEAMS_WEBHOOK_URL=<webhook-url-from-team-lead>
```

> **Security rule**: Never commit `.env` to Git. The file is already in `.gitignore`.

### 5.2 Verify Your `.env` Is Loaded

Run this quick check:

```powershell
node -e "require('dotenv').config(); console.log(process.env.TEST_ENV)"
```

It should print `qa` (or `staging`).

---

## 6. Run Your First Test

### 6.1 Run the Smoke Tests (Fastest Verification)

```powershell
npm run test:smoke
```

This runs only tests tagged `@smoke` — a small fast set that confirms the framework is working.

### 6.2 Watch the Browser Open (Headed Mode)

To see the browser while tests run (useful for learning and debugging):

```powershell
npx playwright test --headed --project=pod3-rules
```

### 6.3 Open the HTML Report After a Run

```powershell
npm run report:open
```

A browser tab opens with the Allure test report showing pass/fail status, steps, screenshots, and logs.

---

## 7. Project Structure Explained

```
EAIS_Automation/
│
├── pages/                    # Page Object Model – UI element locators and actions
│   ├── common/               # Shared pages (login, navigation)
│   │   ├── LoginPage.ts
│   │   └── NavigationPage.ts
│   └── rules/                # Pod 3 – Rules & Rating Engine pages
│       ├── RuleListPage.ts
│       └── RuleEditorPage.ts
│
├── tests/                    # Test specifications (the actual test files)
│   └── pod3-rules/
│       ├── ui/               # Browser UI tests
│       └── api/              # REST API tests
│
├── helpers/                  # Multi-step business workflows
│   ├── auth-helper.ts        # Login, token caching
│   └── rules-helper.ts       # Rule creation/evaluation workflows
│
├── utils/                    # Pure utility functions (no Playwright)
│   ├── api-client.ts         # Typed HTTP client with Bearer auth
│   ├── db.ts                 # PostgreSQL helper (query, insert, cleanup)
│   ├── test-data-factory.ts  # Data builders using Faker.js
│   ├── crypto-utils.ts       # AES-256 encryption/decryption
│   ├── rbac.ts               # Role-based access control
│   ├── date-utils.ts         # Date formatting helpers
│   ├── string-utils.ts       # String manipulation
│   └── allure-utils.ts       # Allure reporting utilities
│
├── fixtures/
│   └── base-fixtures.ts      # Custom Playwright fixtures (auth pages, DB, API)
│
├── integrations/
│   └── ado/                  # Azure DevOps integration
│       ├── ado-test-result-writer.ts
│       ├── fetch-testcases.ts
│       └── push-results.ts
│
├── mcp/
│   └── ado-mcp-server.ts     # MCP server for Claude Code AI integration
│
├── global-setup.ts           # Runs once before all tests (pre-auth all roles)
├── playwright.config.ts      # Playwright configuration
├── tsconfig.json             # TypeScript configuration
├── package.json              # NPM scripts and dependencies
└── .env                      # Environment variables (YOU CREATE THIS)
```

### Understanding the Layers (Read This Carefully)

```
Tests (tests/)          ← What you write; describes WHAT to test
    ↓ uses
Helpers (helpers/)      ← Multi-step workflows; describes HOW to do a business action
    ↓ uses
Pages (pages/)          ← Where to click/type; describes WHERE things are on the UI
    ↓ uses
Fixtures (fixtures/)    ← Test setup; provides authenticated browser sessions
    ↓ uses
Utils (utils/)          ← Data, DB, API; provides supporting functionality
```

**Rule**: Each layer only calls the layer below it. Tests never directly interact with locators. Pages never contain business logic.

---

## 8. How to Write a New Test

Follow this exact step-by-step process every time.

### Step 1: Identify Which Pod Your Feature Belongs To

- Rules/rating-related → Pod 3 (`tests/pod3-rules/`)

### Step 2: Choose the Test Layer

- Testing through the browser UI → put test in `ui/`
- Testing REST API responses → put test in `api/`
- Validating database records → put test in `db/`

### Step 3: Create the Test File

Name format: `<feature-name>.spec.ts`

Example — creating a UI test for rule search in Pod 3:

**File**: `tests/pod3-rules/ui/rule-search.spec.ts`

```typescript
import { test, expect } from '@fixtures/test';
import { RuleListPage } from '@pages/rules/RuleListPage';
import { allure } from '@utils/allure-utils';

test.describe('Rule Search', () => {

  test('TC-18181-050: should find a rule by name', async ({ adminPage }) => {
    // Allure metadata – required for every test
    await allure.label('testId', 'TC-18181-050');
    await allure.feature('Rule Search');
    await allure.severity('normal');

    const ruleListPage = new RuleListPage(adminPage);

    // Step 1: Navigate to Rule List
    await test.step('Navigate to Rule List page', async () => {
      await ruleListPage.goto('/rules');
      await ruleListPage.waitForResults();
    });

    // Step 2: Search for a rule
    await test.step('Search by rule name', async () => {
      await ruleListPage.searchByName('Underwriting Eligibility Rule');
    });

    // Step 3: Verify result appeared
    await test.step('Verify search result is displayed', async () => {
      const result = await ruleListPage.getFirstResult();
      expect(result).toContain('Underwriting Eligibility Rule');
    });
  });

});
```

### Step 4: Check If a Page Object Exists for Your Page

Look in `src/ui/pages/rules/` — if `RuleListPage.ts` already exists, use it.

If you need to add a new locator or method, edit the existing page object file. If the page does not exist at all, create a new one (see [Section 9](#9-page-object-model-pom--how-it-works)).

### Step 5: Run Your New Test in Isolation

```powershell
npx playwright test --grep "TC-18181-050" --headed
```

### Step 6: Verify It Passes and Shows Correct Steps in the Report

```powershell
npm run report:open
```

---

## 9. Page Object Model (POM) – How It Works

Page objects represent one screen or section of the application. They hold **locators** (how to find elements) and **methods** (what you can do on the page).

### Anatomy of a Page Object

```typescript
// File: pages/rules/RuleListPage.ts
import { Page, Locator } from '@playwright/test'
import { BasePage } from '../BasePage'

export class RuleListPage extends BasePage {
  // ── Locators ──────────────────────────────────────────────
  readonly newRuleBtn: Locator
  readonly searchInput: Locator
  readonly searchBtn: Locator
  readonly firstResultRow: Locator

  constructor(page: Page) {
    super(page)
    // Use role/placeholder strategies – never use XPath or CSS ids that change
    this.newRuleBtn = page.getByRole('button', { name: 'New Rule' })
    this.searchInput = page.getByPlaceholder('Search by rule name')
    this.searchBtn = page.getByRole('button', { name: 'Search' })
    this.firstResultRow = page.getByRole('row').nth(1)
  }

  // ── Actions ───────────────────────────────────────────────
  async clickNewRule(): Promise<void> {
    await this.newRuleBtn.click()
  }

  async searchByName(value: string): Promise<void> {
    await this.searchInput.fill(value)
    await this.searchBtn.click()
  }

  // ── Queries ───────────────────────────────────────────────
  async getFirstResult(): Promise<string> {
    return (await this.firstResultRow.textContent()) ?? ''
  }

  async waitForResults(): Promise<void> {
    await this.waitForLoadingToFinish()
  }
}
```

### Page Object Rules (Follow These Strictly)

| Rule | Example |
|------|---------|
| One class per page/major section | `RuleListPage`, `RuleEditorPage` — never combine two pages |
| Extend `BasePage` | Inherit shared navigation/wait helpers (`goto`, `waitForLoadingToFinish`, etc.) |
| Locators defined in constructor | Never create locators inside methods |
| Use semantic selectors | `getByRole()`, `getByLabel()`, `getByTestId()`, `getByPlaceholder()` — never `page.$('.someClass')` |
| Methods do one thing | `clickNewRule()` just clicks the button; it does not navigate or assert |
| No `expect()` inside page objects | Assertions belong in test files only |
| Wait for loading states | After actions, wait for spinners to disappear |

---

## 10. Helpers – Multi-Step Workflows

Helpers combine multiple page object calls into a single business action. Use helpers when a test needs to perform a long setup that is not the focus of the test.

### Example: Using a Helper in a Test

```typescript
import { createRule, evaluateRule } from '@helpers/rules-helper';

test('should evaluate a newly created rule', async ({ adminPage, testData }) => {
  // This creates a full rule in one line — all the steps are hidden in the helper
  const rule = await createRule(adminPage, testData.buildRule());

  // Now the test focuses on evaluation, not rule creation
  const result = await evaluateRule(adminPage, rule.ruleId, { /* sample input payload */ });

  expect(result.matched).toBe(true);
});
```

### When to Write a New Helper

Write a helper when:
- A setup action takes more than 3–4 steps across multiple pages
- The same multi-step action is needed in more than one test file

Write it in the appropriate helper file in `helpers/`.

---

## 11. Test Data – Factories and Fixtures

Never hardcode test data like names, numbers, or dates inside test files. Use the **TestDataFactory**.

### Using the testData Fixture

The `testData` fixture is automatically available in all tests — you do not need to import it separately:

```typescript
test('should create a new rule', async ({ adminPage, testData }) => {
  const ruleData = testData.buildRule();
  // ruleData now has: ruleId, ruleName, ruleType, condition, action,
  //                    effectiveDate, expirationDate, etc.
  // All generated by Faker.js — unique values every run

  const ruleData2 = testData.buildRule({
    ruleType: 'RATING',  // Override specific fields
    isEnabled: false,
  });
});
```

### Available Builders

| Method | Returns | Use For |
|--------|---------|---------|
| `testData.buildRule(overrides?)` | `RuleData` | Creating rule test data |
| `testData.buildUser(role)` | `UserCredentials` | Getting user credentials from env |

---

## 12. Running Tests by Environment and Pod

### Run by Pod

```powershell
npm run test:pod3      # Pod 3 – Rules & Rating
```

### Run by Environment

```powershell
npm run test:qa        # Run against QA environment
npm run test:staging   # Run against Staging environment
```

### Run Smoke Tests Only

```powershell
npm run test:smoke     # Fast sanity check – all @smoke tagged tests
```

### Run a Specific Test by ID

```powershell
npx playwright test --grep "TC-18178-001"
```

### Run Tests in Headed Mode (See the Browser)

```powershell
npx playwright test --headed --project=pod3-rules
```

### Run Tests in Debug Mode (Step Through One by One)

```powershell
npx playwright test --debug --grep "TC-18178-001"
```

### Run Tests with Playwright UI Mode (Best for Development)

```powershell
npx playwright test --ui
```

This opens a GUI where you can pick tests, watch them run, and inspect each step.

---

## 13. Generating and Viewing Reports

### Generate Allure Report

After running tests, generate the HTML report:

```powershell
npm run report
```

### Open the Report in Your Browser

```powershell
npm run report:open
```

### What the Report Shows

- Pass/fail status for each test
- Test steps with timing
- Screenshots captured on failure
- Video recordings on failure
- Test IDs linked to ADO
- Severity, feature, and module tags

---

## 14. Azure DevOps Integration

This section is only needed when you need to sync test cases or upload results to ADO.

### Fetch Test Cases from ADO

This downloads the ADO test plan and creates local YAML mapping files:

```powershell
npm run fetch:testcases
```

Output files: `test-data/ado-cases-pod3-<suiteId>.json` (one per Pod 3 ADO suite — see `PODS` in `integrations/ado/scripts/fetch-testcases.ts`)

### Push Test Results to ADO

After tests run, upload results:

```powershell
npm run push:results
```

This reads the JUnit XML output, maps test IDs to ADO case IDs, creates a test run in ADO, and marks each result.

> **Note**: You need a valid `ADO_PAT` in your `.env` for this to work.

---

## 15. CI/CD Pipeline Overview

The Azure Pipelines file (`azure-pipelines.yml`) runs tests automatically on every push. Here is what happens:

| Stage | What It Does |
|-------|-------------|
| 1. Install | `npm ci` + download Playwright browsers |
| 2. Pod3 Tests | Run all Pod 3 tests, publish JUnit results |
| 3. Report | Merge Allure results, generate combined HTML report |
| 4. Push to ADO | Upload test results to Azure DevOps Test Plans |
| 5. Notify | Send Teams message with pass/fail summary |

As an intern, you do not need to modify the pipeline. Just understand that when you push code to the repository, the pipeline runs automatically.

---

## 16. Troubleshooting Common Issues

### Issue: `npm ci` fails with peer dependency errors

**Fix**: Make sure you are using Node.js v18 or later.
```powershell
node --version   # Must be 18.x.x or higher
```

### Issue: `Cannot find module '@fixtures/base-fixtures'`

**Fix**: TypeScript path aliases need `tsconfig.json` to be recognized. Run:
```powershell
npx tsc --noEmit
```
If there are errors, check that your file is inside the project directory.

### Issue: Tests fail with "Page not found" or "Navigation failed"

**Fix**: Check that `BASE_URL` in your `.env` is correct and the application is running.
```powershell
node -e "require('dotenv').config(); console.log(process.env.BASE_URL)"
```

### Issue: Login fails — "Invalid credentials"

**Fix**: Verify credentials in `.env`. The ADMIN_USERNAME and ADMIN_PASSWORD must match the QA environment.

### Issue: Tests fail with "browser not found"

**Fix**: Re-run:
```powershell
npx playwright install chromium
```

### Issue: Database tests fail with "Connection refused"

**Fix**: Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` in your `.env`. You may need to be on the company VPN to reach the database server.

### Issue: `ENC:` values in `.env` cause decryption errors

**Fix**: These are encrypted credentials. Make sure `ENCRYPTION_KEY` in your `.env` matches the key provided by your team lead. Do not modify encrypted values manually.

### Issue: Playwright UI tests pass locally but fail on CI

**Fix**: This usually means a timing issue. Add a `waitFor` or check for loading spinners:
```typescript
await loadingSpinner.waitFor({ state: 'hidden', timeout: 30000 });
```

### Issue: TypeScript compilation errors

**Fix**: Run the TypeScript compiler to see all errors at once:
```powershell
npx tsc --noEmit
```
Fix each error starting from the first one — later errors often disappear once earlier ones are fixed.

### Getting Help

If you are stuck after trying the above:
1. Check the Playwright documentation: [playwright.dev/docs](https://playwright.dev/docs/intro)
2. Search the error message in the project's ADO work items
3. Ask your team lead with: the error message, the command you ran, and what you already tried

---

## 17. Coding Standards and Conventions

### Test ID Naming

Every test must have a unique ID matching its ADO suite, in the format:
- `TC-<suiteId>-001`, `TC-<suiteId>-002`, ... (e.g. `TC-18178-001` for Suite 18178)

Ask your team lead for the next available ID before writing a new test.

### Test File Structure

Every test file must follow this structure:

```typescript
import { test, expect } from '@fixtures/test';
import { allure } from '@utils/allure-utils';

test.describe('<Feature Name>', () => {

  test('<TC-ID>: <plain English description>', async ({ <fixture> }) => {
    // Required Allure metadata
    await allure.label('testId', 'TC-<suiteId>-XXX');
    await allure.feature('<Feature Name>');
    await allure.severity('<critical | high | normal | low | trivial>');

    // Test body using test.step()
    await test.step('Step description', async () => {
      // actions and assertions
    });
  });

});
```

### Locator Priority (Use in This Order)

1. `getByRole()` — best; uses ARIA roles
2. `getByLabel()` — for form inputs
3. `getByTestId()` — when a `data-testid` attribute exists
4. `getByText()` — for visible text
5. CSS selectors — last resort only, must be documented with a comment explaining why

### Import Aliases

Always use the path aliases — never use relative paths like `../../pages/...`:

```typescript
// Correct
import { RuleListPage } from '@pages/rules/RuleListPage';
import { createRule } from '@helpers/rules-helper';
import { test } from '@fixtures/test';

// Wrong — do not do this
import { RuleListPage } from '../../pages/rules/RuleListPage';
```

### No Hardcoded Values in Tests

```typescript
// Wrong
await searchInput.fill('John Smith');
await dateInput.fill('2024-01-15');

// Correct
const data = testData.buildPolicy();
await searchInput.fill(data.insuredName);
await dateInput.fill(data.effectiveDate);
```

### Comment Rules

Only add a comment when the **why** is not obvious from reading the code. Do not describe what the code does — the code already does that.

---

## 18. Quick Reference – All NPM Scripts

| Script | Command | When to Use |
|--------|---------|-------------|
| Run Pod 3 tests | `npm run test:pod3` | Testing Rules & Rating |
| Run QA environment | `npm run test:qa` | Default QA run |
| Run Staging environment | `npm run test:staging` | Pre-production validation |
| Run smoke tests | `npm run test:smoke` | Quick sanity check |
| Generate Allure report | `npm run report` | After any test run |
| Open Allure report | `npm run report:open` | View results in browser |
| Fetch ADO test cases | `npm run fetch:testcases` | Sync test cases from Azure DevOps |
| Push results to ADO | `npm run push:results` | Upload results to Azure DevOps |
| Start MCP server | `npm run mcp:start` | AI integration with Claude Code |
| Refactor recordings | `npm run refactor:recording` | Convert Playwright recordings to POM |

---

## Day 1 Checklist

Use this checklist to confirm your setup is complete:

- [ ] Node.js v18+ installed (`node --version`)
- [ ] Git installed (`git --version`)
- [ ] VS Code installed with Playwright extension
- [ ] Repository cloned locally
- [ ] `npm ci` completed without errors
- [ ] `npx playwright install chromium` completed
- [ ] `.env` file created and filled with correct values from team lead
- [ ] `npm run test:smoke` passes at least one test
- [ ] `npm run report:open` opens a report in the browser
- [ ] You have read Sections 7, 8, 9 above at least once

Once all boxes are checked, you are ready to start writing tests. Start with a small change to an existing test file to get familiar with the patterns before writing a new test from scratch.

---

*Last updated: 2026-05-21 | Maintained by the EAIS QA Automation Team*
