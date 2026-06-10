# Insurity Automation Framework — Setup Guide

This guide walks you from a fresh clone to a verified first push of test results into Azure DevOps Test Plans.

---

## Prerequisites

Before you begin, ensure the following are installed and accessible on your machine:

| Requirement | Minimum Version | Notes |
|---|---|---|
| Node.js | 18.x LTS | Use `node -v` to confirm. [Download](https://nodejs.org) |
| Git | Any recent | Used for cloning and the `simple-git` integration |
| VS Code | Any recent | Install the **Playwright Test for VS Code** extension (ms-playwright.playwright) |
| Insurity environment access | — | VPN or allowlisted IP required for the Rules Engine URL |
| Azure DevOps access | — | Must have **Test Management (Read & Write)** permission on the target project |

---

## Steps

### 1. Clone the repository

```bash
git clone https://dev.azure.com/your-org/InsurityAutomation/_git/insurity-automation
cd insurity-automation
```

If your organisation uses SSH keys with ADO, use the SSH clone URL instead. After cloning, confirm the working directory contains `package.json` and `playwright.config.ts` before proceeding.

---

### 2. Install dependencies

```bash
npm ci
npx playwright install --with-deps
```

`npm ci` performs a clean, reproducible install from `package-lock.json`. The second command downloads the three Playwright browser binaries (Chromium, Firefox, WebKit) plus any OS-level system libraries they need (fonts, libglib, etc.). On Ubuntu/Debian this requires `sudo`; on macOS and Windows it runs without elevation.

Expected output: lines like `Downloading Chromium 124.0.6xxx...` followed by `✔ Chromium 124.x.x (playwright build v1xxx) downloaded`.

---

### 3. Configure environment variables

```bash
cp .env.example .env        # macOS / Linux
copy .env.example .env      # Windows Command Prompt
Copy-Item .env.example .env # Windows PowerShell
```

Open `.env` in your editor and fill in every value:

- **Application URLs** (`BASE_URL`, `PC_URL`, `RULES_URL`): set to the hostnames provided by the Insurity environment team. Do **not** include a trailing slash.
- **Auth credentials**: provide real test-user credentials for each role (admin, underwriter, agent). Each account must exist in the target environment **before** you run the global setup step.
- **Database**: get the PostgreSQL hostname, port, database name, and a read-only test user from your DBA or environment runbook. The test user only needs `SELECT` on the application schema.
- **Azure DevOps**: see Step 7 for ADO-specific values.
- **Teams webhook**: optional; leave the placeholder if you are not using pipeline notifications locally.

> The `.env` file is listed in `.gitignore` and must **never** be committed.

---

### 4. Verify database connectivity

Run a quick connectivity check before executing any tests that hit the database:

```bash
npx ts-node -e "
import { dbQuery } from './utils/db';
dbQuery('SELECT NOW()').then(r => { console.log('DB OK:', r.rows[0]); process.exit(0); }).catch(e => { console.error('DB FAILED:', e.message); process.exit(1); });
"
```

**What to check if this fails:**

- Confirm `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` in `.env` are correct.
- If you are on a remote machine, ensure the PostgreSQL port (default `5432`) is reachable from your IP (firewall/security-group rule).
- Ask the DBA to run `GRANT CONNECT ON DATABASE insurity_db TO testuser;` if you receive an "access denied" error.
- On Windows, `localhost` may resolve to IPv6 (`::1`); try `127.0.0.1` as `DB_HOST` if the connection times out.

---

### 5. Run global setup (generate auth state)

Playwright stores browser auth cookies/tokens in `.auth/` so tests do not log in on every run. Generate them by running the setup project:

```bash
npx playwright test --project=pod3-rules --grep @setup
```

If the config names the setup project differently (check `playwright.config.ts` → `projects`), run:

```bash
npx playwright test global-setup.ts
```

After a successful run, verify the files exist:

```
.auth/admin.json
.auth/underwriter.json
.auth/agent.json
```

If `.auth/` is empty, check the login selectors in `pages/common/LoginPage.ts` and confirm the credentials in `.env` are correct. Re-run after any password change.

---

### 6. Run your first test

Execute a single known-good smoke test to confirm the full stack is wired up:

```bash
npm run test:pod3 -- --grep TC-18178-001
```

The `--` separator passes arguments through npm to the underlying `playwright test` command. You should see a browser open (unless you add `--headed=false`), the test complete, and a summary like:

```
  1 passed (12.3s)
```

To run all Pod 3 tests:

```bash
npm run test:pod3
```

To run in headed mode (visible browser) for debugging:

```bash
npm run test:pod3 -- --headed
```

JUnit XML results are written to `junit-results/` and Allure raw results to `allure-results/` after each run.

---

### 7. Connect to Azure DevOps

Set the four required ADO variables in your `.env`:

```ini
ADO_ORG_URL=https://dev.azure.com/your-org
ADO_PAT=your-personal-access-token
ADO_PROJECT=InsurityAutomation
ADO_PLAN_ID_POD3=1    # Replace with your actual Test Plan ID
ADO_SUITE_ID_POD3=10  # Replace with your actual root Suite ID
```

**Creating a Personal Access Token (PAT):**

1. Go to `https://dev.azure.com/your-org/_usersSettings/tokens`
2. New Token → name it `insurity-automation-local`
3. Scope: **Test Management** → Read & Write
4. Copy the token into `ADO_PAT` immediately (it is shown only once)

**Fetch test case metadata** (creates local YAML mapping files used by `push:results`):

```bash
npm run fetch:testcases
```

This calls the ADO Test Plans REST API and writes case IDs, titles, and suite paths into `integrations/ado/testcases-pod*.yml`. Re-run whenever test cases are added or renamed in ADO.

---

### 8. Push results to ADO

After a test run has produced JUnit XML in `junit-results/`, upload the outcomes to ADO Test Plans:

```bash
npm run push:results
```

**What happens under the hood:**

1. `integrations/ado/scripts/push-results.ts` reads the JUnit XML files from `junit-results/`.
2. For each test case ID matched in the local YAML mapping, it calls the ADO **Test Runs** API to create a new run against the correct plan and suite.
3. Individual `TestResult` records are patched with `Passed` / `Failed` / `NotExecuted` outcomes, run duration, and error messages.
4. A link to the Allure report artifact (if `ALLURE_REPORT_URL` is set) is attached to the run as a build reference.
5. The script prints a summary of created run IDs and a direct URL to the run in ADO.

If any case IDs in the XML have no matching entry in the YAML mapping, they are skipped and logged as warnings — they will not cause the script to fail.

---

## MCP Server Setup (for Claude Code integration)

The framework ships with a Model Context Protocol (MCP) server that exposes ADO test plan data and Allure results as tools callable by Claude Code.

**Start the server:**

```bash
npm run mcp:start
```

The server listens on `stdio` by default (suitable for Claude Code's local MCP transport).

**Register in Claude Code settings** (`~/.claude/settings.json` or the project-level `.claude/settings.json`):

```json
{
  "mcpServers": {
    "insurity-ado": {
      "command": "npx",
      "args": ["ts-node", "mcp/ado-mcp-server.ts"],
      "cwd": "/absolute/path/to/insurity-automation",
      "env": {
        "ADO_PAT": "${ADO_PAT}",
        "ADO_ORG_URL": "${ADO_ORG_URL}",
        "ADO_PROJECT": "${ADO_PROJECT}"
      }
    }
  }
}
```

After saving, restart Claude Code. The MCP tools (`listTestPlans`, `getTestResults`, `syncTestCases`, etc.) will appear in the tool list.

