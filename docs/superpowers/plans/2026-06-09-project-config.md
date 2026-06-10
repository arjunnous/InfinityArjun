# Project Config File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralise all non-secret project configuration into `src/config/project.config.ts` so consumers use typed constants instead of raw `process.env` calls.

**Architecture:** A single `config` object (`as const`) is created at module load time by reading env vars via the existing `loadEnv()` / `requireEnv()` / `getEnv()` helpers. Non-environment-specific values (ADO org URL, project name, plan/suite IDs) are hardcoded directly. Consumers import named sub-objects (`config.api`, `config.db`, `config.ado`, `config.users`). Secrets (passwords, PAT, encryption key) never appear in this file.

**Tech Stack:** TypeScript, dotenv (via existing `@core/config/env`), Playwright test framework

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/config/project.config.ts` | Typed config object — single source of truth for non-secret config |
| Modify | `tsconfig.json` | Add `@config/*` → `src/config/*` path alias |
| Modify | `src/db/client/pool.ts` | Replace raw `requireEnv`/`getEnv` calls with `config.db.*` |
| Modify | `src/core/utils/auth-helper.ts` | Replace `process.env.BASE_URL` / `process.env.ADMIN_USERNAME` with `config.*` |
| Modify | `src/core/utils/test-data-factory.ts` | Replace `process.env[usernameKey]` with `config.users[role].username` |
| Modify | `integrations/ado/scripts/fetch-testcases.ts` | Replace `requireEnv('ADO_ORG_URL')` / `requireEnv('ADO_PROJECT')` with `config.ado.*` |
| Modify | `integrations/ado/scripts/push-from-report.ts` | Replace ADO org/project env reads with `config.ado.*` |
| Modify | `integrations/ado/ado-test-result-writer.ts` | Replace `process.env.ADO_ORG_URL` with `config.ado.orgUrl` |
| Modify | `.env` | Remove `ADO_ORG_URL`, `ADO_PROJECT`, `ADO_PLAN_ID_POD3`, `ADO_SUITE_ID_POD3` |

---

## Task 1: Add `@config/*` path alias and create `src/config/project.config.ts`

**Files:**
- Modify: `tsconfig.json`
- Create: `src/config/project.config.ts`

- [ ] **Step 1: Add path alias to `tsconfig.json`**

In `tsconfig.json`, inside the `"paths"` block, add one line after the `"@db/*"` entry:

```json
"@config/*": ["src/config/*"]
```

The full `paths` block becomes:

```json
"paths": {
  "@pages/*":    ["src/ui/pages/*"],
  "@helpers/*":  ["src/core/utils/*"],
  "@utils/*":    ["src/core/utils/*"],
  "@fixtures/*": ["src/core/fixtures/*"],
  "@services/*": ["src/api/clients/*"],

  "@core/*":     ["src/core/*"],
  "@api/*":      ["src/api/*"],
  "@ui/*":       ["src/ui/*"],
  "@db/*":       ["src/db/*"],
  "@config/*":   ["src/config/*"]
}
```

- [ ] **Step 2: Create `src/config/project.config.ts`**

```typescript
import { loadEnv, requireEnv, getEnv } from '@core/config/env';

loadEnv();

export const config = {

  api: {
    baseUrl:         requireEnv('BASE_URL'),
    rulesUrl:        requireEnv('RULES_URL'),
    ratingEngineUrl: requireEnv('RATING_ENGINE_URL'),
  },

  db: {
    host: requireEnv('DB_HOST'),
    name: requireEnv('DB_NAME'),
    user: requireEnv('DB_USER'),
    port: parseInt(getEnv('DB_PORT') ?? '5432', 10),
    // DB_PASSWORD intentionally omitted — stays in .env only
  },

  ado: {
    orgUrl:      'https://dev.azure.com/InsurityDevOps',
    project:     'Insurity EAIS AIDLC',
    planIdPod3:  18163,
    suiteIdPod3: 18165,
    // ADO_PAT intentionally omitted — stays in .env only
  },

  users: {
    admin:       { username: requireEnv('ADMIN_USERNAME') },
    underwriter: { username: requireEnv('UNDERWRITER_USERNAME') },
    agent:       { username: requireEnv('AGENT_USERNAME') },
    viewer:      { username: requireEnv('VIEWER_USERNAME') },
    // *_PASSWORD intentionally omitted — stays in .env only
  },

} as const;

export type Config = typeof config;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```
npx tsc --noEmit
```
Expected: no errors. If `noUnusedLocals` fires on `Config`, that is fine — it is exported for consumer use.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json src/config/project.config.ts
git commit -m "feat(config): add src/config/project.config.ts with typed non-secret config"
```

---

## Task 2: Update `src/db/client/pool.ts`

**Files:**
- Modify: `src/db/client/pool.ts`

- [ ] **Step 1: Replace the file content**

Replace the entire file with:

```typescript
import { Pool, type QueryResultRow } from 'pg';
import { resolveSecret } from '@utils/crypto-utils';
import { requireEnv } from '@core/config/env';
import { config } from '@config/project.config';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;

  _pool = new Pool({
    host:     config.db.host,
    port:     config.db.port,
    database: config.db.name,
    user:     config.db.user,
    password: resolveSecret(requireEnv('DB_PASSWORD')),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  _pool.on('error', (err: Error) => {
    console.error('[db] Pool error:', err.message);
  });

  return _pool;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/client/pool.ts
git commit -m "refactor(db): use config.db.* for connection params"
```

---

## Task 3: Update `src/core/utils/auth-helper.ts`

**Files:**
- Modify: `src/core/utils/auth-helper.ts`

- [ ] **Step 1: Add config import and replace env reads**

Replace the top of the file (the import block):

```typescript
// File: helpers/auth-helper.ts

import type { Page, APIRequestContext } from '@playwright/test';
import { LoginPage } from '@pages/common/LoginPage';
import { TestDataFactory } from '@utils/test-data-factory';
import { getAuthToken } from '@utils/api-client';
import { resolveSecret } from '@utils/crypto-utils';
import type { Role } from '@utils/rbac';
import { config } from '@config/project.config';
import { requireEnv } from '@core/config/env';
```

In `loginAs()`, replace:
```typescript
const baseUrl = process.env.BASE_URL;
if (!baseUrl) {
  throw new Error('[loginAs] BASE_URL environment variable is not set.');
}
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
```
with:
```typescript
await page.goto(config.api.baseUrl, { waitUntil: 'domcontentloaded' });
```

In `getValidToken()`, replace:
```typescript
const baseUrl = process.env.BASE_URL;
const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

if (!baseUrl) {
  throw new Error('[getValidToken] BASE_URL environment variable is not set.');
}
if (!username) {
  throw new Error('[getValidToken] ADMIN_USERNAME environment variable is not set.');
}
if (!password) {
  throw new Error('[getValidToken] ADMIN_PASSWORD environment variable is not set.');
}

const token = await getAuthToken(request, baseUrl, {
  username,
  password: resolveSecret(password),
});
```
with:
```typescript
const password = requireEnv('ADMIN_PASSWORD');

const token = await getAuthToken(request, config.api.baseUrl, {
  username: config.users.admin.username,
  password: resolveSecret(password),
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/utils/auth-helper.ts
git commit -m "refactor(auth): use config.api.baseUrl and config.users.admin.username"
```

---

## Task 4: Update `src/core/utils/test-data-factory.ts`

**Files:**
- Modify: `src/core/utils/test-data-factory.ts`

- [ ] **Step 1: Replace env-based username lookup with config**

Replace the top imports:
```typescript
import { faker } from '@faker-js/faker';
import dotenv from 'dotenv';
import { resolveSecret } from '@utils/crypto-utils';
import { config } from '@config/project.config';
import { requireEnv } from '@core/config/env';
```

Remove the `dotenv.config();` call (env is loaded by `loadEnv()` in `project.config.ts`).

Replace the `buildUser` method body:
```typescript
static buildUser(role: 'admin' | 'underwriter' | 'agent'): UserCredentials {
  const passwordKeyMap: Record<'admin' | 'underwriter' | 'agent', string> = {
    admin:       'ADMIN_PASSWORD',
    underwriter: 'UNDERWRITER_PASSWORD',
    agent:       'AGENT_PASSWORD',
  };

  const username = config.users[role].username;
  const rawPassword = requireEnv(passwordKeyMap[role]);

  return {
    username,
    password: resolveSecret(rawPassword),
    role,
    displayName: faker.person.fullName(),
    email: faker.internet.email(),
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/utils/test-data-factory.ts
git commit -m "refactor(test-data): use config.users.*.username for credentials"
```

---

## Task 5: Update `integrations/ado/scripts/fetch-testcases.ts`

**Files:**
- Modify: `integrations/ado/scripts/fetch-testcases.ts`

- [ ] **Step 1: Add config import**

Add to the import block:
```typescript
import { config } from '../../../src/config/project.config';
```

- [ ] **Step 2: Replace ADO org/project env reads in `main()`**

Replace:
```typescript
const orgUrl = requireEnv('ADO_ORG_URL');
const pat = requireEnv('ADO_PAT');
const projectName = requireEnv('ADO_PROJECT');
```
with:
```typescript
const orgUrl = config.ado.orgUrl;
const pat = requireEnv('ADO_PAT');
const projectName = config.ado.project;
```

- [ ] **Step 3: Verify TypeScript compiles**

```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add integrations/ado/scripts/fetch-testcases.ts
git commit -m "refactor(ado): use config.ado.orgUrl and config.ado.project in fetch-testcases"
```

---

## Task 6: Update `integrations/ado/scripts/push-from-report.ts`

**Files:**
- Modify: `integrations/ado/scripts/push-from-report.ts`

- [ ] **Step 1: Add config import**

Add to the import block:
```typescript
import { config } from '../../../src/config/project.config';
```

- [ ] **Step 2: Replace ADO org/project env reads in `main()`**

Replace:
```typescript
const orgUrl     = requireEnv('ADO_ORG_URL');
const pat        = requireEnv('ADO_PAT');
const projectRaw = process.env['ADO_PROJECT_NAME'] ?? process.env['ADO_PROJECT'] ?? 'Insurity EAIS AIDLC';
const project    = encodeURIComponent(projectRaw);
const base       = `${orgUrl}/${project}`;
```
with:
```typescript
const orgUrl     = config.ado.orgUrl;
const pat        = requireEnv('ADO_PAT');
const projectRaw = config.ado.project;
const project    = encodeURIComponent(projectRaw);
const base       = `${orgUrl}/${project}`;
```

- [ ] **Step 3: Verify TypeScript compiles**

```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add integrations/ado/scripts/push-from-report.ts
git commit -m "refactor(ado): use config.ado.* in push-from-report"
```

---

## Task 7: Update `integrations/ado/ado-test-result-writer.ts`

**Files:**
- Modify: `integrations/ado/ado-test-result-writer.ts`

- [ ] **Step 1: Add config import**

Add to the import block at the top:
```typescript
import { config } from '../../src/config/project.config';
```

- [ ] **Step 2: Replace `process.env.ADO_ORG_URL` in `completeRun()`**

In the `completeRun()` method, replace:
```typescript
const orgUrl = process.env.ADO_ORG_URL ?? '';
```
with:
```typescript
const orgUrl = config.ado.orgUrl;
```

- [ ] **Step 3: Verify TypeScript compiles**

```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add integrations/ado/ado-test-result-writer.ts
git commit -m "refactor(ado): use config.ado.orgUrl in ado-test-result-writer"
```

---

## Task 8: Clean up `.env`

**Files:**
- Modify: `.env`

- [ ] **Step 1: Remove keys now hardcoded in config**

Remove these four lines from `.env` (they are hardcoded in `config.ado`):
```
ADO_ORG_URL=https://dev.azure.com/InsurityDevOps
ADO_PROJECT=Insurity EAIS AIDLC
ADO_PLAN_ID_POD3=18163
ADO_SUITE_ID_POD3=18165
```

The ADO section in `.env` should only keep:
```dotenv
# ─────────────────────────────────────────────
# Azure DevOps — shared across environments
# ─────────────────────────────────────────────
ADO_PAT=<value>
```

- [ ] **Step 2: Final compile check**

```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Smoke-run a test to confirm config loads correctly**

```
npx playwright test --project=smoke --list
```
Expected: test list printed without any "Missing required environment variable" errors.

- [ ] **Step 4: Commit**

```bash
git add .env
git commit -m "chore(env): remove non-secret ADO keys now hardcoded in project.config.ts"
```
