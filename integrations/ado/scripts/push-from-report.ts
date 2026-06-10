// File: integrations/ado/scripts/push-from-report.ts
//
// Framework-level push script that reads directly from ado-tc-report.json
// (written by ado-tc-reporter.ts after every test run) instead of Allure files.
//
// Works for ALL suites automatically — no per-suite configuration:
//   1. Reads  test-results/ado-tc-report.json     (pass/fail per TC)
//   2. Groups results by ADO suite ID
//   3. Creates one ADO test run per suite
//   4. Pushes pass / fail / skip outcomes per test case
//   5. Uploads test-results/evidence/{adoCaseId}-Result.txt as result-level attachment
//      (appears in the Attachments tab when clicking a test case result in ADO)
//
// Usage:
//   npm run push:report           ← add to package.json
//   npx ts-node integrations/ado/scripts/push-from-report.ts
//
// Environment variables (from .env):
//   ADO_ORG_URL        https://dev.azure.com/<org>
//   ADO_PAT            Personal Access Token
//   ADO_PROJECT_NAME   Project name (e.g. "Insurity EAIS AIDLC")
//   ADO_PLAN_ID_POD3_<suiteId>   Plan ID for each suite
//   ADO_SUITE_ID_POD3_<suiteId>  Suite ID (used to look up the plan ID)

import * as path  from 'path';
import * as fs    from 'fs';
import * as https from 'https';
import { loadEnv, requireEnv } from '../../../src/core/config/env';
import { config } from '../../../src/config/project.config';

// Load .env (and .env.<TEST_ENV> overlay) from project root
loadEnv();

// ─── Env helpers ─────────────────────────────────────────────────────────────

function optEnvInt(name: string): number {
  const v = process.env[name];
  return v ? parseInt(v, 10) : 0;
}

// ─── ADO REST helper (plain https — no extra deps) ───────────────────────────

function adoRequest(
  method: string,
  url: string,
  pat: string,
  body?: object,
  contentType = 'application/json',
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method,
      headers: {
        Authorization:  `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
        'Content-Type': contentType,
        Accept:         'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/** PATCH a work item using JSON-Patch format (requires application/json-patch+json). */
function patchWorkItem(url: string, pat: string, ops: object[]): Promise<unknown> {
  return adoRequest('PATCH', url, pat, ops as object, 'application/json-patch+json');
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReportResult {
  adoCaseId:    string | null;
  tcTag:        string | null;
  adoSuiteId:   string | null;
  adoPlanId:    string | null;
  testTitle:    string;
  status:       'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
  durationMs:   number;
  errorMessage: string | null;
  evidenceFile?: string | null;
}

interface AdoReport {
  generatedAt: string;
  summary: { total: number; passed: number; failed: number; skipped: number };
  results: ReportResult[];
}

// ─── Outcome mapping ──────────────────────────────────────────────────────────

function toAdoOutcome(status: ReportResult['status']): string {
  switch (status) {
    case 'passed':      return 'Passed';
    case 'failed':
    case 'timedOut':
    case 'interrupted': return 'Failed';
    case 'skipped':     return 'NotExecuted';
    default:            return 'NotExecuted';
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const orgUrl     = config.ado.orgUrl;
  const pat        = requireEnv('ADO_PAT');
  const projectRaw = config.ado.project;
  const project    = encodeURIComponent(projectRaw);
  const base       = `${orgUrl}/${project}`;

  const ROOT        = path.resolve(__dirname, '../../..');
  const reportPath  = path.join(ROOT, 'test-results', 'reports', 'ado-tc-report.json');
  const evidenceDir = path.join(ROOT, 'test-results', 'evidence');

  if (!fs.existsSync(reportPath)) {
    console.error(`[push-from-report] ado-tc-report.json not found at: ${reportPath}`);
    console.error('  Run tests first, then call this script.');
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as AdoReport;
  console.log(`\n[push-from-report] Report: ${report.generatedAt}`);
  console.log(`  Total: ${report.summary.total}  Pass: ${report.summary.passed}  Fail: ${report.summary.failed}`);

  // Group by suite
  const bySuite = new Map<string, ReportResult[]>();
  for (const r of report.results) {
    const sid = r.adoSuiteId;
    if (!sid || !r.adoCaseId) continue;   // skip tests with no ADO mapping
    const arr = bySuite.get(sid) ?? [];
    arr.push(r);
    bySuite.set(sid, arr);
  }

  if (bySuite.size === 0) {
    console.warn('[push-from-report] No results with ADO suite/case IDs found — nothing to push.');
    return;
  }

  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');

  for (const [suiteId, results] of bySuite.entries()) {
    const planId  = results[0]?.adoPlanId ?? optEnvInt(`ADO_PLAN_ID_POD3_${suiteId}`).toString();
    if (!planId) {
      console.warn(`[push-from-report] No plan ID for suite ${suiteId} — skipping`);
      continue;
    }

    console.log(`\n[Suite ${suiteId} / Plan ${planId}]  ${results.length} result(s)`);

    // ── 1: Get test points ──────────────────────────────────────────────────
    const ptUrl  = `${base}/_apis/test/plans/${planId}/suites/${suiteId}/points?api-version=7.0&%24top=500`;
    const ptResp = await adoRequest('GET', ptUrl, pat) as { value: Array<{ id: number; testCase: { id: string } }> };
    const points = ptResp.value ?? [];
    const caseToPoint = new Map(points.map(p => [p.testCase.id, p.id]));
    console.log(`  Test points: ${points.length}`);

    // ── 2: Create test run ──────────────────────────────────────────────────
    const ptIds = results
      .map(r => caseToPoint.get(r.adoCaseId!))
      .filter((id): id is number => id !== undefined);

    const runName = `Suite ${suiteId} — Automated Run — ${ts}`;
    const runBody = { name: runName, plan: { id: planId }, pointIds: ptIds, isAutomated: true };
    const runResp = await adoRequest('POST', `${base}/_apis/test/runs?api-version=7.0`, pat, runBody) as { id: number };
    const runId   = runResp.id;
    console.log(`  Run ID: ${runId}`);

    // ── 3: Get result entries ────────────────────────────────────────────────
    await new Promise(r => setTimeout(r, 2000));  // brief wait for ADO to initialise
    const resResp = await adoRequest('GET', `${base}/_apis/test/runs/${runId}/results?api-version=7.0`, pat) as {
      value: Array<{ id: number; testCase: { id: string } }>
    };
    const resItems = resResp.value ?? [];
    const caseToResult = new Map(resItems.map(r => [r.testCase.id, r.id]));
    console.log(`  Result entries: ${resItems.length}`);

    // ── 4: Push outcomes — comment = full evidence (visible when clicking run) ─
    // The comment field is the FIRST thing ADO shows when you click a run from
    // the test-point execution history panel. By putting the full evidence here,
    // the user sees REQUEST / RESPONSE / VALIDATION / FINAL RESULT immediately
    // without needing to navigate to the Attachments tab.
    const updates = results.flatMap(r => {
      const resultId = caseToResult.get(r.adoCaseId!);
      if (!resultId) return [];

      // Read evidence file for this result (written by ado-tc-reporter during test run)
      const tryNames = [
        `${r.adoCaseId}-Result.txt`,
        `${r.tcTag}-Result.txt`,
        r.evidenceFile,
      ].filter((n): n is string => !!n);
      const txtPath  = tryNames.map(n => path.join(evidenceDir, n)).find(p => fs.existsSync(p));
      // Use full evidence as comment (ADO supports up to ~10000 chars in result comment)
      const comment  = txtPath
        ? fs.readFileSync(txtPath, 'utf8').slice(0, 9500)
        : `${toAdoOutcome(r.status).toUpperCase()} | ${r.tcTag ?? r.testTitle.slice(0, 80)}`;

      return [{
        id:           resultId,
        outcome:      toAdoOutcome(r.status),
        state:        'Completed',
        durationInMs: r.durationMs,
        comment,
        errorMessage: r.errorMessage ?? undefined,
      }];
    });

    if (updates.length > 0) {
      await adoRequest('PATCH', `${base}/_apis/test/runs/${runId}/results?api-version=7.0`, pat, updates);
      console.log(`  Pushed ${updates.length} outcomes with evidence comments`);
    }

    // ── 5: Complete run ──────────────────────────────────────────────────────
    await adoRequest('PATCH', `${base}/_apis/test/runs/${runId}?api-version=7.0`, pat, { state: 'Completed' });

    // ── 5b: Update TEST POINT outcomes directly ──────────────────────────────
    // This persists the outcome on the Execute page so it does NOT revert on
    // refresh. Without this, ADO shows test run results only — not point state.
    const pointUpdates = results.flatMap(r => {
      const pointId = caseToPoint.get(r.adoCaseId!);
      if (!pointId) return [];
      // ADO outcome strings for test points (different from run result outcomes)
      const ptOutcome =
        r.status === 'passed'  ? 'Passed'      :
        r.status === 'skipped' ? 'NotApplicable':
        'Failed';
      return [{ id: pointId, results: { outcome: ptOutcome } }];
    });

    if (pointUpdates.length > 0) {
      try {
        const ptUrl = `${base}/_apis/testplan/Plans/${planId}/Suites/${suiteId}/TestPoint?api-version=7.0-preview.2`;
        await adoRequest('PATCH', ptUrl, pat, { testPointUpdateParams: pointUpdates });
        console.log(`  Updated ${pointUpdates.length} test point outcome(s) — Execute page will show correct state`);
      } catch (err) {
        // Fallback: try older API format
        try {
          for (const pu of pointUpdates) {
            const oldUrl = `${base}/_apis/test/plans/${planId}/suites/${suiteId}/points/${pu.id}?api-version=5.0`;
            await adoRequest('PATCH', oldUrl, pat, { outcome: pu.results.outcome });
          }
          console.log(`  Updated ${pointUpdates.length} test point(s) via fallback API`);
        } catch { /* non-fatal */ }
      }
    }

    // ── 6: Upload evidence JSON per result (replace old attachment each run) ──
    let uploaded = 0;
    for (const r of results) {
      const resultId = caseToResult.get(r.adoCaseId!);
      if (!resultId) continue;

      // Delete OLD evidence attachments so each run replaces the previous
      try {
        const existingAtts = await adoRequest('GET', `${base}/_apis/test/Runs/${runId}/Results/${resultId}/Attachments?api-version=5.0`, pat) as { value?: Array<{ id: number; fileName: string }> };
        const oldAtts = (existingAtts.value ?? []).filter(a => a.fileName?.includes('-Result.'));
        for (const old of oldAtts) {
          try { await adoRequest('DELETE', `${base}/_apis/test/Runs/${runId}/Results/${resultId}/Attachments/${old.id}?api-version=5.0`, pat); } catch { /* non-fatal */ }
        }
      } catch { /* non-fatal */ }

      // Upload JSON + HTML evidence files (both per result)
      const filesToUpload = [
        `${r.adoCaseId}-Result.json`,
        `${r.tcTag}-Result.json`,
        `${r.adoCaseId}-Result.html`,
        `${r.tcTag}-Result.html`,
      ]
        .filter((n): n is string => !!n)
        .map(n => path.join(evidenceDir, n))
        .filter(p => fs.existsSync(p));

      for (const filePath of filesToUpload) {
        const isJson   = filePath.endsWith('.json');
        const fileName = path.basename(filePath);
        let content = fs.readFileSync(filePath, 'utf8');

        // Fill run_id / result_id into the JSON before uploading
        if (isJson) {
          try {
            const doc = JSON.parse(content) as Record<string, unknown>;
            const meta = doc.evidence_metadata as Record<string, unknown>;
            if (meta) { meta.run_id = runId; meta.result_id = resultId; }
            content = JSON.stringify(doc, null, 2);
            // Also patch the HTML so it shows the real run/result IDs
            const htmlPath = filePath.replace('.json', '.html');
            if (fs.existsSync(htmlPath)) {
              let html = fs.readFileSync(htmlPath, 'utf8');
              html = html.replace('(assigned on push)', String(runId)).replace('(assigned on push)', String(resultId));
              fs.writeFileSync(htmlPath, html, 'utf8');
            }
          } catch { /* not valid JSON */ }
        }

        const b64     = Buffer.from(content, 'utf8').toString('base64');
        const comment = `${toAdoOutcome(r.status)} | ${r.tcTag} | Run ${runId}`;
        const attBody = { stream: b64, fileName, comment, attachmentType: 'GeneralAttachment' };
        await adoRequest('POST', `${base}/_apis/test/Runs/${runId}/Results/${resultId}/Attachments?api-version=5.0`, pat, attBody);
        uploaded++;
        console.log(`  [evidence] ${fileName} → result ${resultId} (${r.tcTag})`);
      }
    }
    if (uploaded === 0) console.log('  [evidence] No evidence files found in test-results/evidence/');

    // ── 7: Link all TCs to their User Story via TestedBy-Reverse on the US WI ──
    // Suite names follow the project convention: "{US_WI_ID} : {title}"
    // e.g. "14017 : Real Time Rule Execution" → User Story WI 14017
    // We parse the US ID, get its existing TestedBy links, and add any missing ones.
    // Adding TestedBy-Reverse on the US automatically creates TestedBy-Forward on each TC,
    // making the test cases appear in the WI's "Tests" tab with pass/fail outcomes.
    let userStoryWiId: number | null = null;
    try {
      const suiteInfo = await adoRequest('GET', `${base}/_apis/testplan/Plans/${planId}/Suites/${suiteId}?api-version=7.0`, pat) as { name?: string };
      const m = (suiteInfo.name ?? '').match(/^(\d+)\s*:/);
      if (m) {
        userStoryWiId = parseInt(m[1], 10);
        console.log(`  [story-link] Parsed User Story WI ${userStoryWiId} from suite name: "${suiteInfo.name}"`);
      }
    } catch { /* non-fatal */ }

    if (userStoryWiId) {
      try {
        // Get existing TestedBy-Reverse links on the User Story to avoid duplicates
        const usData = await adoRequest('GET', `${orgUrl}/${encodeURIComponent(projectRaw)}/_apis/wit/workitems/${userStoryWiId}?%24expand=relations&api-version=7.0`, pat) as { relations?: Array<{ rel: string; url: string }> };
        const existingTcIds = new Set(
          (usData.relations ?? [])
            .filter(r => r.rel === 'Microsoft.VSTS.Common.TestedBy-Forward')
            .map(r => r.url.split('/').pop() ?? '')
        );

        // Build add-ops for TCs not yet linked
        // TestedBy-Forward on the User Story → Test Case means "US is Tested By TC"
        // This is the correct direction for ADO requirement suites and the WI Tests tab.
        const addOps = results
          .filter(r => r.adoCaseId && !existingTcIds.has(r.adoCaseId))
          .map(r => ({
            op:    'add',
            path:  '/relations/-',
            value: {
              rel:        'Microsoft.VSTS.Common.TestedBy-Forward',
              url:        `${orgUrl}/_apis/wit/workItems/${r.adoCaseId}`,
              attributes: { comment: `Automated | Suite ${suiteId} | Run ${runId}` },
            },
          }));

        if (addOps.length > 0) {
          const wiUrl = `${orgUrl}/${encodeURIComponent(projectRaw)}/_apis/wit/workitems/${userStoryWiId}?api-version=7.0`;
          await patchWorkItem(wiUrl, pat, addOps);
          console.log(`  [story-link] Added ${addOps.length} TestedBy links on User Story WI ${userStoryWiId}`);
        } else {
          console.log(`  [story-link] All ${results.length} TCs already linked to User Story WI ${userStoryWiId}`);
        }
      } catch (err) {
        console.warn(`  [story-link] Failed to link TCs to User Story WI ${userStoryWiId}:`, err instanceof Error ? err.message : String(err));
      }
    } else {
      console.log('  [story-link] Suite name does not start with a WI ID — skipping User Story link');
    }

    // ── 9: Set AutomationStatus = "Automated" on every test case WI ──────────
    let wiUpdated = 0;
    for (const r of results) {
      if (!r.adoCaseId) continue;
      try {
        const wiUrl = `${orgUrl}/${encodeURIComponent(projectRaw)}/_apis/wit/workitems/${r.adoCaseId}?api-version=7.0`;
        await patchWorkItem(wiUrl, pat, [
          { op: 'add', path: '/fields/Microsoft.VSTS.TCM.AutomationStatus', value: 'Automated' },
        ]);
        wiUpdated++;
      } catch { /* non-fatal */ }
    }
    if (wiUpdated > 0) console.log(`  Set AutomationStatus=Automated on ${wiUpdated} test case WIs`);

    const passCount = results.filter(r => r.status === 'passed').length;
    const failCount = results.filter(r => r.status !== 'passed' && r.status !== 'skipped').length;
    const skipCount = results.filter(r => r.status === 'skipped').length;
    console.log(`  Done: ${passCount} Passed / ${failCount} Failed / ${skipCount} Skipped`);
    console.log(`  Run: ${orgUrl}/${encodeURIComponent(projectRaw)}/_TestManagement/Runs?runId=${runId}`);

    // ── 10: Post test results summary as a comment on the User Story ──────────
    // This makes results immediately visible when opening the User Story in ADO,
    // without needing to navigate to Test Plans or find the Tests tab.
    if (userStoryWiId) {
      try {
        const runDate = new Date().toISOString().slice(0, 10);
        const rows = results.map(r => {
          const icon   = r.status === 'passed' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
          const outcome = r.status === 'passed' ? 'Passed' : r.status === 'skipped' ? 'Skipped' : 'Failed';
          const tcLink = `<a href="${orgUrl}/${encodeURIComponent(projectRaw)}/_workitems/edit/${r.adoCaseId}">${r.adoCaseId}</a>`;
          const title  = r.testTitle.slice(0, 100);
          return `<tr><td style="padding:3px 8px;border:1px solid #ddd">${tcLink}</td><td style="padding:3px 8px;border:1px solid #ddd;font-size:12px">${title}</td><td style="padding:3px 8px;border:1px solid #ddd;text-align:center">${icon} ${outcome}</td></tr>`;
        }).join('');

        const commentHtml = `<h3>🤖 Automated Test Results — Suite ${suiteId}</h3>`
          + `<p><b>Run:</b> <a href="${orgUrl}/${encodeURIComponent(projectRaw)}/_TestManagement/Runs?runId=${runId}">Run ${runId}</a> &nbsp;|&nbsp; <b>Date:</b> ${runDate} &nbsp;|&nbsp; <b>Environment:</b> QA</p>`
          + `<p>✅ <b>Passed: ${passCount}</b> &nbsp; ❌ <b>Failed: ${failCount}</b> &nbsp; ⏭️ <b>Skipped: ${skipCount}</b> &nbsp; Total: ${results.length}</p>`
          + `<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif">`
          + `<tr style="background:#0078d4;color:white"><th style="padding:4px 8px;border:1px solid #ddd">TC WI</th><th style="padding:4px 8px;border:1px solid #ddd">Test Case</th><th style="padding:4px 8px;border:1px solid #ddd">Result</th></tr>`
          + rows
          + `</table>`
          + `<p style="color:#666;font-size:11px">Playwright automation | push-from-report.ts</p>`;

        const commentUrl = `${orgUrl}/${encodeURIComponent(projectRaw)}/_apis/wit/workItems/${userStoryWiId}/comments?api-version=7.0-preview.3`;
        await adoRequest('POST', commentUrl, pat, { text: commentHtml });
        console.log(`  [comment] Posted results summary to User Story WI ${userStoryWiId} Discussion`);
      } catch (err) {
        console.warn(`  [comment] Failed to post comment: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log('\n[push-from-report] All suites processed. Done.');
}

main().catch(err => {
  console.error('[push-from-report] FATAL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
