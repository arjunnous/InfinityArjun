// File: integrations/ado/scripts/fetch-testcases.ts

import * as path from 'path';
import * as fs from 'fs';
import * as azdev from 'azure-devops-node-api';
import { loadEnv, requireEnv } from '../../../src/core/config/env';
import { config } from '../../../src/config/project.config';
import { AdoTestCaseReader, TestCaseItem } from '../ado-test-case-reader';

// Load .env (and .env.<TEST_ENV> overlay) from project root
loadEnv();

function optionalEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    console.warn(`Warning: env var ${name}="${raw}" is not a valid integer — using fallback ${fallback}`);
    return fallback;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Pod configuration
// ---------------------------------------------------------------------------
interface PodConfig {
  name: string;
  label: string;
  planIdEnv: string;
  suiteIdEnv: string;
  outputFile: string;
}

const PODS: PodConfig[] = [
  // ── Pod 3 — one entry per ADO suite ────────────────────────────────────────
  {
    name: 'pod3-18178',
    label: 'Rules Suite 18178 — API First Rule Integration (Pod 3)',
    planIdEnv: 'ADO_PLAN_ID_POD3_18178',
    suiteIdEnv: 'ADO_SUITE_ID_POD3_18178',
    outputFile: 'test-data/ado-cases/ado-cases-pod3-18178.json',
  },
  {
    name: 'pod3-18180',
    label: 'Rules Suite 18180 — Separation of Rules (Pod 3)',
    planIdEnv: 'ADO_PLAN_ID_POD3_18180',
    suiteIdEnv: 'ADO_SUITE_ID_POD3_18180',
    outputFile: 'test-data/ado-cases/ado-cases-pod3-18180.json',
  },
  {
    name: 'pod3-18186',
    label: 'Rules Suite 18186 — Audit Log, Version History & Rollback (Pod 3)',
    planIdEnv: 'ADO_PLAN_ID_POD3_18186',
    suiteIdEnv: 'ADO_SUITE_ID_POD3_18186',
    outputFile: 'test-data/ado-cases/ado-cases-pod3-18186.json',
  },
  {
    name: 'pod3-18181',
    label: 'Rules Suite 18181 — Flexible Data Model Support (Pod 3)',
    planIdEnv: 'ADO_PLAN_ID_POD3_18181',
    suiteIdEnv: 'ADO_SUITE_ID_POD3_18181',
    outputFile: 'test-data/ado-cases/ado-cases-pod3-18181.json',
  },
  {
    name: 'pod3-18187',
    label: 'Rules Suite 18187 — Base Premium Calculation (Pod 3)',
    planIdEnv: 'ADO_PLAN_ID_POD3_18187',
    suiteIdEnv: 'ADO_SUITE_ID_POD3_18187',
    outputFile: 'test-data/ado-cases/ado-cases-pod3-18187.json',
  },
  {
    name: 'pod3-18306',
    label: 'Rating Engine Suite 18306 — Occurrence Level Premium Calculation (Pod 3)',
    planIdEnv: 'ADO_PLAN_ID_POD3_18306',
    suiteIdEnv: 'ADO_SUITE_ID_POD3_18306',
    outputFile: 'test-data/ado-cases/ado-cases-pod3-18306.json',
  },
];

// ---------------------------------------------------------------------------
// Console table printer
// ---------------------------------------------------------------------------
function printSummaryTable(rows: Array<{ pod: string; suiteId: number; count: number }>): void {
  const COL_POD = 20;
  const COL_SUITE = 12;
  const COL_COUNT = 12;
  const sep = `+${'-'.repeat(COL_POD)}+${'-'.repeat(COL_SUITE)}+${'-'.repeat(COL_COUNT)}+`;

  console.log('');
  console.log('Test Case Fetch Summary');
  console.log(sep);
  console.log(
    `| ${'Pod'.padEnd(COL_POD - 2)} | ${'Suite ID'.padEnd(COL_SUITE - 2)} | ${'Cases'.padEnd(COL_COUNT - 2)} |`
  );
  console.log(sep);
  for (const row of rows) {
    console.log(
      `| ${row.pod.padEnd(COL_POD - 2)} | ${String(row.suiteId).padEnd(COL_SUITE - 2)} | ${String(row.count).padEnd(COL_COUNT - 2)} |`
    );
  }
  console.log(sep);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  console.log(
    `| ${'TOTAL'.padEnd(COL_POD - 2)} | ${''.padEnd(COL_SUITE - 2)} | ${String(total).padEnd(COL_COUNT - 2)} |`
  );
  console.log(sep);
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const orgUrl = config.ado.orgUrl;
  const pat = requireEnv('ADO_PAT');
  const projectName = config.ado.project;

  const authHandler = azdev.getPersonalAccessTokenHandler(pat);
  const connection = new azdev.WebApi(orgUrl, authHandler);
  const reader = new AdoTestCaseReader(connection, projectName);

  const BASE = path.resolve(__dirname, '../../..');
  const summaryRows: Array<{ pod: string; suiteId: number; count: number }> = [];

  for (const pod of PODS) {
    const planId = optionalEnvInt(pod.planIdEnv, 0);
    const suiteId = optionalEnvInt(pod.suiteIdEnv, 0);

    if (planId === 0 || suiteId === 0) {
      console.warn(
        `Skipping ${pod.label}: ${pod.planIdEnv}=${planId}, ${pod.suiteIdEnv}=${suiteId} — both must be non-zero`
      );
      summaryRows.push({ pod: pod.label, suiteId, count: 0 });
      continue;
    }

    console.log(`Fetching ${pod.label} (planId=${planId}, suiteId=${suiteId}) ...`);

    let cases: TestCaseItem[];
    try {
      cases = await reader.getTestCases(planId, suiteId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR fetching ${pod.label}: ${msg}`);
      summaryRows.push({ pod: pod.label, suiteId, count: 0 });
      continue;
    }

    const outPath = path.resolve(BASE, pod.outputFile);
    await reader.exportToJson(cases, outPath);
    console.log(`  Written ${cases.length} cases → ${outPath}`);

    summaryRows.push({ pod: pod.label, suiteId, count: cases.length });
  }

  printSummaryTable(summaryRows);
}

main().catch(err => {
  console.error('FATAL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
