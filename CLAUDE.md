# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project
Insurity Infinty 
Playwright + TypeScript API/UI automation suite for **Insurity EAIS — Pod 3**, covering the Rules Engine and Rating Engine microservices. Integrates with Azure DevOps Test Plans for automatic result publishing and evidence upload.

---

## Commands

```bash
# Run tests
npm run test:pod3:qa                          # All Pod 3 tests against QA
npm run test:smoke:qa                         # @smoke-tagged tests only
npx playwright test --project=pod3-suite-18178   # Single suite by project name
npx playwright test tests/pod3-rules/api/suite18178.spec.ts  # Single file
npx playwright test --grep "Verify creating"  # By title pattern

# Reports
npm run report                                # Open Playwright HTML report
npm run push:report                           # Push outcomes + evidence to ADO Test Plans

# ADO data
npm run fetch:testcases                       # Refresh test-data/ado-cases-pod3-*.json from ADO

# Credentials
npm run encrypt:creds -- --generate-key       # Generate ENCRYPTION_KEY
npm run encrypt:creds -- --value "secret"     # Encrypt a password → ENC:<iv>:<tag>:<ciphertext>

# TypeScript check
npx tsc --noEmit
```

There are pre-existing TS errors in the repo unrelated to current work; ignore them unless they are in files you've touched.

---

## Configuration

**`src/config/project.config.ts`** is the single source of truth for all non-secret config. It is committed and hardcodes:

```
config.api.baseUrl / rulesUrl / ratingEngineUrl
config.db.host / name / user / port
config.ado.orgUrl / project / planIdPod3 / suiteIdPod3
config.users.admin.username  (and underwriter, agent, viewer)
```

**`.env`** holds **secrets only** — passwords, `ADO_PAT`, `ENCRYPTION_KEY`. Never put secrets in `project.config.ts`. Never put non-secret values in `.env`.

`loadEnv()` (from `@core/config/env`) must be called before any `requireEnv()` usage. `project.config.ts` calls it at import time, so importing the config is sufficient.

`TEST_ENV` env var selects the environment overlay (`.env.qa`, `.env.staging`). Currently only QA is configured.

---

## Architecture

Strict layered dependency — imports always point **downward**:

```
Tests (tests/**/*.spec.ts)
  └─ Helpers (src/core/utils/*-helper.ts)       ← multi-step reusable workflows
       └─ Service Objects (src/api/clients/)     ← one class per API domain, extend BaseApiService
       └─ Page Objects (src/ui/pages/)           ← locators + actions only, no assertions
            └─ Fixtures (src/*/fixtures/)        ← typed test context (auth, DB pool, ADO IDs)
                 └─ Core Utils (src/core/utils/) ← crypto, data factory, state, RBAC
                      └─ Config (src/config/)    ← project.config.ts
```

**Never import upward.** A util must never import a service object or page object.

### Key files

| File | Purpose |
|------|---------|
| `src/config/project.config.ts` | All non-secret config values (hardcoded) |
| `src/core/config/env.ts` | `loadEnv()`, `requireEnv()`, `getEnv()` — dotenv loader |
| `src/core/fixtures/test.ts` | Merged fixture — single import for all tests |
| `src/core/utils/rbac.ts` | Role enum, `AUTH_STORAGE_PATH` map |
| `src/core/utils/crypto-utils.ts` | `resolveSecret()` — decrypts `ENC:` passwords transparently |
| `src/core/utils/StateManager.ts` | Cross-worker JSON-on-disk state sharing |
| `src/core/utils/test-data-factory.ts` | `TestDataFactory.buildRule()`, `.buildUser(role)` |
| `src/core/utils/ado-annotations.ts` | `useSuiteAnnotations(suiteId, planId)` |
| `src/api/clients/common/BaseApiService.ts` | Base class with retry/backoff; all service objects extend this |
| `src/db/client/pool.ts` | Singleton `pg.Pool` — use `query<T>()` for DB access in tests |
| `global-setup.ts` | Pre-authenticates all roles; **currently disabled** in `playwright.config.ts` |
| `integrations/ado/scripts/push-from-report.ts` | Post-run ADO result publisher |

---

## TypeScript Path Aliases

```
@config/*   → src/config/*
@core/*     → src/core/*
@utils/*    → src/core/utils/*
@helpers/*  → src/core/utils/*
@services/* → src/api/clients/*
@pages/*    → src/ui/pages/*
@fixtures/* → src/core/fixtures/*
@api/*      → src/api/*
@ui/*       → src/ui/*
@db/*       → src/db/*
```

Scripts under `integrations/` cannot use `@config/*` aliases — use relative paths (`../../../src/config/project.config`).

---

## ADO Integration

### TC ID in test titles

```typescript
test('[TC-AI-001] @TC17340 Verify creating a rule returns 201', async () => { ... });
```

- `TC-AI-{NNN}` — suite-scoped tag used for `ado-cases` JSON lookup
- `@TC{adoId}` — explicit ADO work item ID; takes priority over all auto-resolution

### Wire a spec file to ADO

Every spec file must call `useSuiteAnnotations` in a `beforeEach`:

```typescript
import { useSuiteAnnotations } from '@utils/ado-annotations';

test.describe('Suite 18178', () => {
  test.beforeEach(({ testInfo }) => {
    useSuiteAnnotations(18178, config.ado.planIdPod3)(testInfo);
  });
});
```

### TC resolution order (highest priority first)

1. `@TC{id}` tag in test title
2. `test-data/tc-map-pod3-{suiteId}.json` (hand-authored overrides)
3. Numeric extraction from `TC-{number}` pattern in title
4. `test-data/ado-cases-pod3-{suiteId}.json` lookup by `tcTag`
5. Title substring match against ADO case titles

### When auto-resolution fails

Add an explicit entry to `test-data/tc-map-pod3-{suiteId}.json`:
```json
{ "TC-AI-015": 17499 }
```

---

## Test Patterns

### Cross-worker state

```typescript
import { StateManager } from '@utils/StateManager';

// beforeAll — one worker writes
const state = new StateManager('suite18178');
state.set('ruleId', createdRule.id);

// any test, any worker — reads from disk
const ruleId = state.get<string>('ruleId');
// state.clear() in afterAll
```

### Serial vs parallel

Use `test.describe.serial()` only when tests have explicit ordering dependencies (e.g., create → read → delete lifecycle). Otherwise tests run in parallel by default.

### Evidence attachment

```typescript
test.info().annotations.push({
  type: 'Evidence',
  description: `Rule created: id=${id} status=${status}`,
});
```

Use `description`, not `value` — only `description` renders in the HTML report and ADO.

### Credentials in tests

```typescript
// ✓ Correct — reads username from config, password from .env via resolveSecret
const user = TestDataFactory.buildUser('admin');

// ✗ Wrong — never hardcode or read process.env directly in tests
```

---

## Playwright Projects

Rules Engine suites use `config.api.rulesUrl`; Rating Engine suites use `config.api.ratingEngineUrl`. Project names follow `pod3-suite-{suiteId}`. Add new suites by copying an existing project block in `playwright.config.ts`.

---

## Adding New Tests

1. Create `tests/pod3-{domain}/api/suite{suiteId}.spec.ts`
2. Import from `src/core/fixtures/test.ts` (merged fixture)
3. Call `useSuiteAnnotations(suiteId, config.ado.planIdPod3)` in `beforeEach`
4. Name tests: `[TC-AI-{NNN}] @TC{adoId} Verify {outcome} when {condition}`
5. Add a Playwright project entry in `playwright.config.ts`
6. Run `npm run fetch:testcases` if ADO test cases were added, then commit the JSON files
