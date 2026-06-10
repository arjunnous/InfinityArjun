# README.md Design Spec

**Date:** 2026-06-09
**Author:** Arjun PR (via brainstorming session)
**Topic:** Professional README.md for EAIS Automation Framework

---

## Context

The Insurity EAIS (Enterprise AI Suite) automation framework is a production-grade Playwright + TypeScript test automation solution targeting Pod 3 (Rules Engine + Rating Engine). The repo already contains `SETUP.md` (environment setup steps) and `ONBOARDING.md` (intern walkthrough). The README.md is missing and needs to serve as the authoritative entry point for onboarding, knowledge transfer, and enterprise adoption.

---

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Relationship to existing docs | Complement (link out) | SETUP.md and ONBOARDING.md remain; README links to them |
| Primary audience | Mixed team (junior to senior) | Explain the "why" alongside technical details |
| Mermaid diagrams | Architecture layer diagram only | User selected; one diagram is better than visual noise |
| Structure | Comprehensive Reference README (Option A) | Single file, ToC, all sections self-contained |

---

## Section Plan (13 sections, approved by user)

### Header Block
- Badge row: Playwright version, TypeScript, Node.js, Azure Pipelines CI status
- One-paragraph elevator pitch covering: what is automated, which product/pod, key integrations
- Quick-jump links: `[Quick Start]` `[Architecture]` `[CI/CD]` `[Contributing]`

### Table of Contents
- Numbered, anchor-linked, all 13 sections listed

### 1. Framework Overview
- Product context: Insurity EAIS, Pod 3 — Rules Engine + Rating Engine
- Why Playwright + TypeScript: type safety, unified API+UI runner, built-in retry, trace viewer
- Key capabilities list: multi-role auth, multi-environment, encrypted credentials, ADO sync, evidence capture, PostgreSQL DB testing

### 2. Architecture
- Mermaid `graph TD` diagram: Tests → Helpers → Service Objects / Page Objects → Fixtures → Core Utils
- Layer responsibility table: what each layer DOES and what it must NOT do
- Dependency rule: always points downward, no circular dependencies

### 3. Folder Structure
- Annotated directory tree (excluding node_modules, .git)
- Path alias table: `@services/*`, `@fixtures/*`, `@pages/*`, `@utils/*`, etc.

### 4. Getting Started
- Prerequisites (Node 18+, npm, Playwright browsers)
- Link to SETUP.md callout box
- Minimal "first run" command sequence (5 lines max)

### 5. Configuration
- `.env` key reference table grouped by: URLs, Credentials, Encryption, ADO, Database, Notifications
- How `ENC:` format works (AES-256-GCM): how to generate a key and encrypt a value
- `.env.qa` / `.env.staging` overlay pattern: how TEST_ENV controls which file is loaded

### 6. Test Data Strategy
- Three-layer model:
  1. Factory layer (Faker.js): `TestDataFactory.buildRule()`, `buildUser(role)`
  2. Environment layer: credentials via `resolveSecret()`
  3. ADO pre-fetch layer: `tc-map-pod3-*.json` and `ado-cases-pod3-*.json`
- `StateManager` for cross-worker state sharing
- Cleanup strategy: `StateManager.clear()`, `dbCleanup()`, serial test ordering

### 7. Running Tests
- Full `npm run` scripts table with one-line descriptions
- `--grep`, `--project` filter examples
- `TEST_ENV=staging` override example
- Run a single suite by file path

### 8. Reporting & Evidence
- Report artifact inventory: HTML report, JUnit XML, ADO TC Report JSON, evidence files
- How to open the Playwright trace viewer
- How to manually push results to ADO (`npm run push:report`)
- Report archival: timestamped folders under `reports/`

### 9. CI/CD Integration (Azure Pipelines)
- Four-stage pipeline: Install → Pod3_Rules → PushToADO → Notify
- Variable groups table: `insurity-secrets` vs `insurity-config`
- Trigger conditions: nightly cron, push to main/develop, PR to main
- Teams notification outcome

### 10. ADO Integration Deep-Dive
- TC ID 5-tier resolution chain (numbered list with examples)
- `useSuiteAnnotations(suiteId, planId)` usage example
- Pre-run fetch + post-run push workflow (text-based sequence)
- When and how to update `tc-map-pod3-*.json` manually

### 11. Best Practices
- Test title naming convention: `[TC-AI-001] @TC<adoId> Verify <outcome> when <condition>`
- Layer responsibility enforcement table (what belongs where)
- Parallel vs serial: when to use `test.describe.serial()`
- Evidence annotation pattern
- Never-do list: hardcoded data, CSS selectors, assertions in page objects, `test.only` in CI

### 12. Scalability Recommendations
- Adding a new microservice: step-by-step (service class → fixture → tests)
- Adding a new environment: `.env.X` overlay + pipeline variable group
- Adding a new role: RBAC matrix entry + global-setup + `.auth/<role>.json`
- Worker count and shard guidance
- When to refactor from serial to parallel

### 13. Contributing Guidelines
- Branch naming: `feature/`, `fix/`, `chore/`
- PR checklist (local run passes, ADO IDs mapped, no hardcoded data, tc-map updated if needed)
- Code review expectations
- Credential generation and encryption steps
- Link to ONBOARDING.md callout box

---

## Tone & Style

- Developer-friendly: command examples on every section that has "how to"
- Mixed audience: brief "why this exists" note on non-obvious patterns
- No marketing language; be direct and concrete
- Tables preferred over prose for reference information
- Callout boxes (blockquote `>` style) for links to SETUP.md and ONBOARDING.md
- Code blocks for all commands and env vars

---

## Out of Scope

- Duplicating content from SETUP.md (environment setup steps)
- Duplicating content from ONBOARDING.md (intern walkthrough)
- Adding a Troubleshooting / FAQ section (not requested)
- Sensitive values — use placeholders like `<your-token>` in env var examples
