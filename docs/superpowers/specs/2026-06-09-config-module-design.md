# Config Module Design

**Date:** 2026-06-09  
**Status:** Approved  

## Problem

Configuration values are scattered across the codebase as raw `process.env.X` reads. There is no single typed, validated source of truth. Hardcoded values (timeouts, viewport, retries) live directly in `playwright.config.ts`. This makes it hard to find what is configurable and causes misconfiguration to surface only mid-run.

## Decision

A single TypeScript module `src/core/config/config.ts` exports a frozen, namespaced `config` object. It calls `loadEnv()` internally, reads env vars once at import time, validates required fields eagerly, and exposes typed values grouped by concern.

Credentials and secrets (`ADMIN_PASSWORD`, `ADO_PAT`, `DB_PASSWORD`, `ENCRYPTION_KEY`, usernames) are **not** included — they stay in `.env` (gitignored) and are accessed via `resolveSecret`/`requireEnv` at point of use.

## Shape

```
config.env
  .name            string     — "qa" | "staging"        (TEST_ENV, default "qa")
  .label           string     — "QA" | "STAGING"        (display label)
  .isCI            boolean    — true when process.env.CI is set

config.api
  .baseUrl         string     — required   (BASE_URL)
  .rulesUrl        string?    — optional   (RULES_URL)
  .ratingEngineUrl string?    — optional   (RATING_ENGINE_URL)

config.db
  .host            string?    — optional   (DB_HOST)
  .name            string?    — optional   (DB_NAME)
  .user            string?    — optional   (DB_USER)
  .port            number     — default 5432 (DB_PORT)

config.ado
  .orgUrl          string     — required   (ADO_ORG_URL)
  .project         string     — required   (ADO_PROJECT)
  .planId          number?    — optional   (ADO_PLAN_ID_POD3)
  .suiteId         number?    — optional   (ADO_SUITE_ID_POD3)

config.playwright
  .timeout         number     — 120_000
  .expectTimeout   number     — 10_000
  .retries         number     — 1
  .workers         number?    — 2 on CI, undefined locally
  .navigationTimeout number   — 30_000
  .actionTimeout   number     — 15_000
  .screenshot      string     — 'only-on-failure'
  .trace           string     — 'on-first-retry'
  .viewport        object     — { width: 1440, height: 900 }

config.teams
  .webhookUrl      string?    — optional   (TEAMS_WEBHOOK_URL)
```

## Validation

- `config.api.baseUrl`, `config.ado.orgUrl`, `config.ado.project` are required — throw at startup if missing.
- All other fields are optional or have defaults.
- Numeric fields are parsed with `parseInt`; invalid values fall back to defaults.
- The exported object is `Object.freeze`d and typed `as const`.

## Initialization

`config.ts` calls `loadEnv()` at module load time. Consumers that currently call `loadEnv()` themselves (`playwright.config.ts`, `global-setup.ts`) can keep doing so — `loadEnv` is idempotent. Eventually those calls can be removed once `config` is imported first.

## Integration Points

| File | Change |
|---|---|
| `src/core/config/config.ts` | **New file** |
| `playwright.config.ts` | Replace hardcoded timeouts, retries, workers, viewports, baseURLs with `config.*` |
| `global-setup.ts` | `process.env.BASE_URL` → `config.api.baseUrl` |
| `src/api/fixtures/api.fixture.ts` | `process.env.BASE_URL` → `config.api.baseUrl` |
| `src/ui/fixtures/ui.fixture.ts` | `process.env.BASE_URL` → `config.api.baseUrl` |
| `src/db/client/pool.ts` | `DB_HOST/NAME/USER/PORT` env reads → `config.db.*` |
| `integrations/ado/scripts/fetch-testcases.ts` | ADO env reads → `config.ado.*` |
| `integrations/ado/scripts/push-from-report.ts` | ADO env reads → `config.ado.*` |
| `integrations/ado/scripts/populate-req-suite.ts` | ADO env reads → `config.ado.*` |

## Files Not Changed

- `src/core/config/env.ts` — stays as the env loader; `config.ts` builds on top of it
- Any file that reads credentials/secrets — those stay with `resolveSecret`/`requireEnv`

## Out of Scope

- Schema validation library (Zod) — not needed at this codebase size
- Per-environment JSON/YAML config files — `.env` overlay pattern already handles this
- Adding a new `staging` environment — that is a separate task
