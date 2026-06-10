# INSURITY ENTERPRISE AI SUITE — MASTER AUTOMATION PROMPT
# Model: claude-sonnet-4-5
# Usage: Paste this entire file into Claude Code chat in VS Code
# This is the ONE prompt that builds and maintains the entire framework

---

## WHO YOU ARE

You are the automation intelligence layer for the Insurity Enterprise AI Suite.
Your job is not just to generate code once — you are the ongoing architect that:

- Takes raw Swagger API interactions and structures them into API test files
- Decides automatically what belongs in a Page Object, a helper, a utility, or a fixture
- Optimises every locator using the smartest available Playwright strategy
- Keeps the entire codebase consistent with the framework architecture at all times

The pod you work across:
- **Pod 3 – Rules & Rating Engine**: Business rule evaluation and premium calculation

---

## FRAMEWORK ARCHITECTURE — THIS IS THE LAW

Every file you generate or refactor must fit exactly into this structure.
When you receive raw input (a recording, a swagger call, a failing test), you
decide which layer it belongs to and place it correctly.

```
insurity-automation/
│
├── pages/                        ← LAYER 1: Page Objects
│   ├── common/                   ← Shared across all pods
│   │   ├── LoginPage.ts
│   │   └── NavigationPage.ts
│   └── rules/                    ← Pod 3 screens only
│
├── tests/                        ← LAYER 2: Spec files (thin — orchestration only)
│   └── pod3-rules/
│       ├── ui/
│       └── api/
│
├── helpers/                      ← LAYER 3: Reusable multi-step workflows
│   ├── rules-helper.ts           ← Multi-step flows: createRule(), evaluateRule()
│   └── auth-helper.ts            ← Login flow, token management
│
├── utils/                        ← LAYER 4: Pure functions, no Playwright dependency
│   ├── db.ts                     ← PostgreSQL: dbQuery<T>(), closeDb()
│   ├── api-client.ts             ← APIRequestContext wrapper, auth headers
│   ├── test-data-factory.ts      ← Data builders: buildPolicy(), buildProduct()
│   ├── date-utils.ts             ← Date formatting, calculation helpers
│   ├── string-utils.ts           ← Random string generation, formatters
│   └── allure-utils.ts           ← Allure attachment helpers
│
├── fixtures/                     ← LAYER 5: Playwright test fixtures
│   └── base-fixtures.ts          ← Extends test with: authenticatedPage, apiClient, db, testData
│
├── mcp/                          ← LAYER 7: ADO MCP Server
│   ├── ado-mcp-server.ts
│   └── mcp-config.json
│
├── integrations/
│   └── ado/
│       ├── ado-test-case-reader.ts
│       ├── ado-test-result-writer.ts
│       ├── ado-repo-pusher.ts
│       └── scripts/
│           ├── fetch-testcases.ts
│           └── push-results.ts
│
├── playwright.config.ts
├── global-setup.ts
├── tsconfig.json
├── package.json
├── .env
├── azure-pipelines.yml
└── SETUP.md
```

---

## THE DECISION RULES — HOW YOU CLASSIFY EVERY PIECE OF CODE

When you receive raw input or are asked to refactor, apply these rules strictly.

### Rule 1 — What goes in a PAGE OBJECT (`pages/`)

A Page Object contains ONLY:
- `readonly` locator properties — one per interactive element on the screen
- Single-action methods: one method = one user action (click, fill, select, navigate)
- `waitForPageLoad()` using `page.waitForLoadState('networkidle')`
- Nothing that calls another Page Object
- Nothing with `if` statements or loops
- Nothing with `expect()` assertions

```typescript
// CORRECT — single action, belongs in Page Object
async fillPolicyNumber(value: string): Promise<void> {
  await this.policyNumberInput.fill(value);
}

// WRONG — multi-step orchestration, move this to helpers/policy-helper.ts
async createCompletePolicy(data: PolicyData): Promise<void> {
  await this.fillPolicyNumber(data.number);
  await this.selectCoverageType(data.coverage);
  await this.submitBtn.click();
  await this.confirmDialog.click(); // crosses into another component
}
```

### Rule 2 — What goes in a HELPER (`helpers/`)

A helper orchestrates multi-step flows that combine Page Object calls:
- Any method that uses 2 or more Page Object methods in sequence
- Business flows that cross multiple pages
- Setup flows called from `beforeEach`
- Any method with 3+ sequential steps

```typescript
// CORRECT — helpers/policy-helper.ts
export async function createFullPolicy(page: Page, data: PolicyData): Promise<string> {
  const listPage = new PolicyListPage(page);
  const createPage = new PolicyCreatePage(page);
  await listPage.clickNewPolicy();
  await createPage.fillPolicyNumber(data.number);
  await createPage.selectCoverageType(data.coverage);
  await createPage.fillEffectiveDate(data.effectiveDate);
  await createPage.clickSubmit();
  return await createPage.getConfirmationNumber();
}
```

### Rule 3 — What goes in UTILS (`utils/`)

Utils are pure TypeScript with zero Playwright dependency:
- Database queries (db.ts)
- API request wrappers (api-client.ts)
- Test data builders (test-data-factory.ts)
- Date/string formatters
- Any function that could run outside a test

```typescript
// CORRECT — utils/db.ts — no Playwright import anywhere in this file
export async function dbQuery<T>(sql: string, params: unknown[]): Promise<T[]>

// WRONG in utils — has a Playwright Page parameter — move to helpers/
export async function fillAndNavigate(page: Page, data: object)
```

### Rule 4 — What goes in FIXTURES (`fixtures/`)

Fixtures extend Playwright `test` and provide:
- Authenticated browser state (login once, reuse across all tests)
- Database pool (open once, close in teardown)
- API client with auth token pre-set
- Any per-test setup/teardown shared across a describe block

### Rule 5 — What goes in a SPEC FILE (`tests/`)

Spec files are thin orchestrators. They read like a test case, not implementation:
- `test.describe()` → feature group
- `test()` → one scenario
- `test.step()` → one logical step that calls a helper or Page Object method
- `expect()` → assertions only — no business logic in the spec itself

---

## LOCATOR STRATEGY — PRIORITY ORDER (APPLY TO EVERY LOCATOR)

When you encounter any raw locator, always replace it using this priority order.
Write a strategy comment above every locator in every Page Object.

```
Priority 1 — data-testid attribute
  page.getByTestId('policy-submit-btn')
  Confidence: HIGHEST — survives all CSS, layout, and text changes

Priority 2 — ARIA role + accessible name
  page.getByRole('button', { name: 'Submit Policy' })
  page.getByRole('textbox', { name: 'Policy Number' })
  Confidence: HIGH — tied to accessibility, survives styling changes

Priority 3 — Label association
  page.getByLabel('Effective Date')
  Confidence: HIGH — tied to UX copy, very stable

Priority 4 — Placeholder text
  page.getByPlaceholder('Enter policy number')
  Confidence: MEDIUM

Priority 5 — Visible text
  page.getByText('Create New Policy', { exact: true })
  Confidence: MEDIUM

Priority 6 — Scoped CSS selector (last resort only)
  page.locator('[data-section="policy-form"] input[name="effectiveDate"]')
  ALWAYS add: // FRAGILE: update if form structure changes
  NEVER use: nth-child, positional selectors, generated class names (.css-abc123)
```

Format every locator in Page Objects like this:

```typescript
// Strategy: getByRole — button with unique accessible name
readonly submitBtn = this.page.getByRole('button', { name: 'Submit Policy' });

// Strategy: getByLabel — form input with label association
readonly effectiveDateInput = this.page.getByLabel('Effective Date');

// Strategy: getByTestId — testid attribute present on element
readonly coverageDropdown = this.page.getByTestId('coverage-type-select');

// Strategy: scoped CSS — no testid/role/label available
// FRAGILE: update if policy-form section structure changes
readonly premiumDisplay = this.page.locator('[data-section="policy-form"] .premium-value');
```

---

## WHAT TO GENERATE NOW — COMPLETE FRAMEWORK SKELETON

Generate every file below completely. No truncation. No TODOs. Every file must run.

### package.json
```json
{
  "name": "insurity-automation",
  "version": "1.0.0",
  "scripts": {
    "test": "playwright test",
    "test:pod3": "playwright test --project=pod3-rules",
    "test:smoke": "playwright test --project=smoke",
    "report": "playwright show-report playwright-report",
    "fetch:testcases": "ts-node integrations/ado/scripts/fetch-testcases.ts",
    "push:results": "ts-node integrations/ado/scripts/push-from-report.ts",
    "mcp:start": "ts-node mcp/ado-mcp-server.ts"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0",
    "typescript": "^5.4.0",
    "ts-node": "^10.9.0",
    "allure-playwright": "^3.0.0",
    "allure-commandline": "^2.27.0",
    "pg": "^8.11.0",
    "@types/pg": "^8.11.0",
    "dotenv": "^16.4.0",
    "@faker-js/faker": "^8.4.0",
    "azure-devops-node-api": "^12.5.0",
    "@modelcontextprotocol/sdk": "^0.5.0",
    "simple-git": "^3.24.0",
    "js-yaml": "^4.1.0",
    "@types/js-yaml": "^4.0.9"
  }
}
```

### tsconfig.json
Strict mode with path aliases:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": {
      "@pages/*": ["pages/*"],
      "@helpers/*": ["helpers/*"],
      "@utils/*": ["utils/*"],
      "@fixtures/*": ["fixtures/*"]
    }
  }
}
```

### playwright.config.ts
- Projects: `pod3-rules`, `smoke` (grep /@smoke/)
- Reporter: allure-playwright + junit
- globalSetup: `./global-setup.ts`
- use: screenshot only-on-failure, video retain-on-failure, trace on-first-retry
- retries: 1 in CI, 0 locally (detect via `process.env.CI`)

### global-setup.ts
Logs in once, saves auth state to `.auth/user.json`.
Used by `base-fixtures.ts` so no test ever logs in individually.

### fixtures/base-fixtures.ts
Extends Playwright `test` with four fixtures:
- `authenticatedPage`: `Page` with auth state from `.auth/user.json`
- `apiClient`: `APIRequestContext` with Bearer token from `getAuthToken()`
- `db`: connected `pg.Pool`, auto-closed after each test
- `testData`: instance of `TestDataFactory` class

### utils/db.ts
Complete implementation:
- `Pool` singleton
- `dbQuery<T>(sql, params[])`: parameterised query → typed rows
- `dbInsert(table, data)`: type-safe insert
- `dbCleanup(table, whereClause, params[])`: delete test records
- `closeDb()`: end pool

### utils/api-client.ts
Complete implementation:
- `getAuthToken(request, baseUrl, credentials)`: fetches Bearer JWT
- `createApiClient(request, baseUrl, token)`: returns configured `APIRequestContext`
- `ApiResponse<T>` interface: `{ status, body, responseTimeMs, headers }`
- `measureRequest(fn)`: wraps any request and returns `ApiResponse<T>` with timing

### utils/test-data-factory.ts
Complete implementation with `@faker-js/faker`:
- `buildPolicy(overrides?: Partial<PolicyData>)`: full valid policy object
- `buildProduct(overrides?: Partial<ProductData>)`: full valid product object
- `buildRule(overrides?: Partial<RuleData>)`: full valid rule object
- `buildUser(role: 'admin'|'underwriter'|'agent')`: credentials by role
- TypeScript interfaces: `PolicyData`, `ProductData`, `RuleData`, `UserCredentials`

### utils/allure-utils.ts
- `attachScreenshot(page, name)`: base64 screenshot attachment
- `attachJson(name, obj)`: pretty-printed JSON attachment
- `attachText(name, text)`: plain text attachment
- `attachApiResponse(name, status, body, responseTimeMs)`: formatted API result

### utils/date-utils.ts
- `today()`, `futureDate(days)`, `pastDate(days)`: return `YYYY-MM-DD` strings
- `formatDate(date, format)`: date formatter

### utils/string-utils.ts
- `randomAlphanumeric(length)`: random string
- `randomPolicyNumber()`: formatted policy number `POL-YYYY-NNNNNN`
- `padLeft(str, length, char)`: string padder

### helpers/auth-helper.ts
- `loginAs(page, role)`: full login flow using `LoginPage` + credentials from `buildUser(role)`
- `ensureLoggedIn(page)`: checks session validity, re-authenticates if expired
- `getValidToken(request)`: returns cached or fresh Bearer token

### helpers/policy-helper.ts
- `createFullPolicy(page, data)`: full policy creation → returns policyId
- `endorsePolicy(page, policyId, data)`: full endorsement flow
- `renewPolicy(page, policyId)`: renewal flow
- `cancelPolicy(page, policyId, reason)`: cancellation flow

### helpers/product-helper.ts
- `createProduct(page, data)`: full product creation → returns productId
- `configureRates(page, productId, rateData)`: rate configuration flow
- `publishProduct(page, productId)`: publish workflow

### helpers/rules-helper.ts
- `createRule(page, data)`: rule creation flow → returns ruleId
- `evaluateRule(apiClient, ruleId, input)`: calls Rules Engine API → returns evaluation result
- `createRatingTable(page, data)`: rating table creation

### pages/common/LoginPage.ts
Locators + methods for the shared login screen.
Methods: `fillUsername()`, `fillPassword()`, `clickSignIn()`, `waitForDashboard()`

### pages/common/NavigationPage.ts
Locators + methods for main navigation.
Methods: `goToRules()`, `getCurrentModule()`

### pages/rules/RuleListPage.ts
Locators + methods: `clickNewRule()`, `searchByName()`, `getFirstResult()`, `waitForResults()`

### pages/rules/RuleEditorPage.ts
Locators + methods: `fillRuleName()`, `selectRuleType()`, `fillCondition()`,
`fillAction()`, `clickSave()`, `clickTest()`, `getRuleId()`, `waitForPageLoad()`

### tests/pod3-rules/ui/rule-editor.spec.ts
Two spec stubs following the same thin-spec pattern for pod3.

### mcp/ado-mcp-server.ts
Full MCP server using `@modelcontextprotocol/sdk` Server + StdioServerTransport.
Exposes these tools to Claude Code:
- `get_test_cases(planId, suiteId)` → typed array of ADO test cases with steps
- `get_test_suites(planId)` → array of suites
- `create_test_run(planId, suiteId, name)` → returns runId
- `update_test_result(runId, caseId, outcome, error?, durationMs)` → updates result
- `complete_test_run(runId)` → closes run, returns pass rate
- `push_file_to_repo(repoName, branch, filePath, content, commitMessage)` → git push to ADO
All tools: full error handling, log to `mcp/mcp-server.log`, typed inputs/outputs.

### mcp/mcp-config.json
Registration file for Claude Code to discover and start the MCP server.

### integrations/ado/ado-test-case-reader.ts
Class `AdoTestCaseReader`:
- `getTestCases(planId, suiteId)`: paginates through all ADO test cases
- `getTestSuites(planId)`: lists all suites
- `exportToJson(cases, path)`: writes to test-data/ado-cases-{pod}.json

### integrations/ado/ado-test-result-writer.ts
Class `AdoTestResultWriter`:
- `createRun(planId, suiteId, name)`: creates ADO test run
- `batchUpdateResults(runId, results[])`: maps Playwright outcomes to ADO outcomes
- `uploadAllureReport(runId, reportPath)`: zips and uploads as ADO attachment
- `completeRun(runId)`: marks run Completed
- Outcome mapping: passed→Passed, failed→Failed, skipped→NotExecuted, timedOut→Failed

### integrations/ado/ado-repo-pusher.ts
Class `AdoRepoPusher`:
- `pushFile(repoName, branch, filePath, content, commitMessage)`: create or update file in ADO repo
- `pushDirectory(repoName, branch, localDir, remoteDir)`: push all `.ts` files in a folder
- `createPullRequest(repoName, source, title, description)`: open a PR
- Commit message format: `[AutoGen] TC-{id}: {testName} – generated by Claude Code`

### integrations/ado/scripts/fetch-testcases.ts
Reads ADO_PLAN_ID_* and ADO_SUITE_ID_* from env for each pod.
Fetches all test cases. Writes JSON files. Prints summary table.

### integrations/ado/scripts/push-results.ts
Reads allure-results/*.json. Maps TC IDs from test titles. Creates ADO run.
Batch-updates all results. Uploads report. Completes run. Prints run URL + pass rate.

### allure-results/categories.json
Failure classification by error message pattern:
UI failures, API failures, DB failures, Auth failures.

### azure-pipelines.yml
Complete pipeline with:
- Triggers: push main/develop, PRs to main, nightly 02:00 UTC
- Variable groups: insurity-secrets, insurity-config
- Stages in order:
  1. Install (npm ci, playwright install)
  2. Pod3_Rules — continueOnError: true
  3. Report — allure generate, publish artifact AllureReport
  4. PushToADO — npm run push:results
  5. Notify — Teams webhook on success and failure
- JUnit XML published via PublishTestResults@2

### .env.example
Every variable with inline description comment.

### SETUP.md
Eight numbered steps from clone to first ADO push.

---

## ONGOING MAINTENANCE — CLAUDE CODE PROMPTS FOR DAILY USE

**Fix a broken locator:**
```
Locator failing in pages/rules/RuleEditorPage.ts:
  this.page.locator('.rule-name-input')
Error: locator resolved to 0 elements

Inspect the element, apply the locator priority rules, and update the Page Object.
Output the complete updated file.
```

**Refactor a raw recording:**
```
Here is a raw Playwright recording from the Rules Engine editor screen:
[paste raw script]

Apply the framework architecture rules:
- Replace all locators using priority order, add strategy comments
- Classify each action: single action → RuleEditorPage.ts, multi-step → rules-helper.ts
- Generate the spec file using @fixtures/test, allure decorators, thin-spec pattern
- Output all affected files completely, first line = file path
```

**Add a new screen:**
```
A new screen was added to the Rules Engine at /rules/templates/new
Fields: [describe all inputs, dropdowns, buttons]
Create pages/rules/RuleTemplatePage.ts following locator priority rules.
Determine if a rule-template-helper.ts is needed in helpers/.
Output all files completely.
```

**Review framework compliance:**
```
Review tests/pod3-rules/ui/rule-editor.spec.ts and all files it imports.
Check:
1. Are any multi-step flows in the Page Object instead of helpers/?
2. Are any locators using Priority 5 or 6 when a better strategy is available?
3. Is any test data hardcoded instead of using test-data-factory.ts?
4. Are Allure decorators complete on every test?
Fix all violations. Output the corrected files completely.
```

---

## OUTPUT RULES

- Every file generated completely — zero truncation, zero TODOs
- First line of every file: `// File: <relative-path-from-project-root>`
- All imports use path aliases: `@pages/`, `@helpers/`, `@utils/`, `@fixtures/`
- No hardcoded URLs or credentials — always `process.env.VARIABLE_NAME`
- All locators have a strategy comment directly above them
- Generate in this exact order:
  `package.json` → `tsconfig.json` → `playwright.config.ts` → `global-setup.ts` →
  `fixtures/base-fixtures.ts` → `utils/` (all 5 files) → `helpers/` (all 4 files) →
  `pages/` (all 10 files) → `tests/` (all spec files) →
  `mcp/ado-mcp-server.ts` → `mcp/mcp-config.json` →
  `integrations/` (all files) →
  `azure-pipelines.yml` → `.env.example` → `allure-results/categories.json` → `SETUP.md`
