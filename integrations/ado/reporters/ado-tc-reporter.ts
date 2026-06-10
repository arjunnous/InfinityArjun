/**
 * integrations/ado/reporters/ado-tc-reporter.ts
 *
 * Custom Playwright reporter that shows ADO Test Case IDs, titles, and execution
 * outcomes in a formatted table at the end of every test run.
 *
 * ─── Output locations ─────────────────────────────────────────────────────────
 *   Console  → printed after the default list reporter
 *   File     → test-results/ado-tc-report.json  (machine-readable)
 *
 * ─── Annotation contract (set by fixtures/tc-fixture.ts) ────────────────────
 *   TestCaseID   TC-4.3-001    ← human tag extracted from test title
 *   ADO_CaseID   18502         ← actual ADO work-item numeric ID (from JSON cache)
 *   ADO_SuiteID  18181
 *   ADO_PlanID   18163
 *
 * ─── Sample console output ────────────────────────────────────────────────────
 *
 *  ┌──────────────────────────────────────────────────────────────────────────┐
 *  │  ADO Test Case Report — Suite 18181 (Plan 18163)                        │
 *  ├───────────┬────────────────────────────────────────────┬────────┬───────┤
 *  │ ADO ID    │ Test Case Title / TC Tag                   │ Status │  Time │
 *  ├───────────┼────────────────────────────────────────────┼────────┼───────┤
 *  │ 18502     │ [TC-4.3-001] POST /fields — Valid String…  │ PASSED │  1.3s │
 *  │ 18503     │ [TC-4.3-002] POST /fields — Enum field …   │ PASSED │  0.3s │
 *  │ 18504     │ [TC-4.3-003] POST /fields — Enum no allo…  │ FAILED │  0.3s │
 *  │           │   ↳ Expected: 400 / Received: 201          │        │       │
 *  │ (pending) │ [TC-Auth-01] POST without auth → 401       │ SKIP   │  ---  │
 *  └───────────┴────────────────────────────────────────────┴────────┴───────┘
 *   30 passed · 7 failed · 5 skipped
 */

import * as fs   from 'fs';
import * as path from 'path';
import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdoAnnotation {
  type:        string;
  description: string;
}

interface AdoTcEntry {
  testTitle:    string;
  tcTag:        string | null;   // e.g. "TC-4.3-001"
  adoCaseId:    string | null;   // e.g. "18502" (from ADO_CaseID annotation)
  adoSuiteId:   string | null;
  adoPlanId:    string | null;
  status:       'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
  durationMs:   number;
  errorMessage: string | null;
  retries:      number;
  // Evidence annotations set via test.info().annotations.push() during test execution
  annotations:  AdoAnnotation[];
  // Console output captured during test — contains apiLog() request/response lines
  stdout:       string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function fmtMs(ms: number): string {
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function statusLabel(s: AdoTcEntry['status']): string {
  switch (s) {
    case 'passed':      return 'PASSED';
    case 'failed':
    case 'timedOut':
    case 'interrupted': return 'FAILED';
    case 'skipped':     return 'SKIP  ';
    default:            return 'UNKNWN';
  }
}

function statusColor(s: AdoTcEntry['status']): string {
  switch (s) {
    case 'passed':      return '\x1b[32m'; // green
    case 'failed':
    case 'timedOut':
    case 'interrupted': return '\x1b[31m'; // red
    case 'skipped':     return '\x1b[33m'; // yellow
    default:            return '\x1b[0m';
  }
}

const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const CYAN  = '\x1b[36m';

// ─── Evidence JSON builder (matches TC-20155-evidence.json format) ────────────

interface EvidenceApiCall {
  label:    string;
  request:  { method: string; url: string; headers: Record<string, string>; payload: unknown };
  response: { status: number; status_text: string; headers: Record<string, string>; body: unknown; response_time_ms: number };
}

function parseApiCallsToEvidence(stdout: string, _host: string): EvidenceApiCall[] {
  // Strip ANSI colour codes; normalise Unicode arrows → ASCII equivalents
  const clean = stdout
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\r/g, '')
    .replace(/→/g, '->')    // Unicode right arrow → ASCII ->
    .replace(/←/g, '<-');  // Unicode left arrow  ← ASCII <-

  const lines = clean.split('\n');
  const calls: EvidenceApiCall[] = [];
  let cur: Partial<EvidenceApiCall> | null = null;
  let bodyLines: string[] = [];
  let inReqBody  = false;
  let inRespBody = false;

  const STATUS_TEXT: Record<number, string> = {
    200: 'OK', 201: 'Created', 204: 'No Content',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 422: 'Unprocessable Entity', 500: 'Internal Server Error',
  };

  const flushBody = () => {
    if (!cur) return;
    const bodyStr = bodyLines.join('\n').trim();
    const parsed  = (() => { try { return JSON.parse(bodyStr); } catch { return bodyStr || null; } })();
    if (inReqBody)  (cur.request  as EvidenceApiCall['request']).payload       = parsed;
    if (inRespBody) (cur.response as EvidenceApiCall['response']).body         = parsed;
    bodyLines = []; inReqBody = false; inRespBody = false;
  };

  for (const raw of lines) {
    const line = raw.trim();

    // ── New request ──────────────────────────────────────────────────────────
    // Formats:
    //   -> POST https://host/path  (label)   ← full URL with protocol
    //   -> POST /api/v1/path       (label)   ← relative path (no host)
    //   [lifecycle] POST https://...  (label)
    const reqM = line.match(/^(?:->\s*|(?:\[lifecycle\]\s*))(GET|POST|PATCH|DELETE|PUT)\s+((?:https?:\/\/|\/)\S+?)(?:\s+\((.+?)\))?$/i);
    if (reqM) {
      flushBody();
      if (cur?.request?.url) calls.push(cur as EvidenceApiCall);
      const method = reqM[1].toUpperCase();
      // If relative path, prepend the host
      const rawUrl = reqM[2];
      const url    = rawUrl.startsWith('http') ? rawUrl : `https://${_host}${rawUrl}`;
      const label  = reqM[3] ?? `${method} ${rawUrl.split('/').slice(-2).join('/')}`;
      cur = {
        label,
        request:  { method, url, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, payload: null },
        response: { status: 0, status_text: '', headers: { 'content-type': 'application/vnd.api+json; charset=utf-8', server: 'Microsoft-IIS/10.0', 'x-api-version': '1.0' }, body: null, response_time_ms: 0 },
      };
      inReqBody = false; inRespBody = false; bodyLines = [];
      continue;
    }

    // ── Request body marker ──────────────────────────────────────────────────
    // Matches: "body:", "Body:", "Request Body:", "  body: {...}"
    if (cur && !inRespBody && line.match(/^(?:request\s+)?body:\s*(.*)/i)) {
      flushBody();
      inReqBody = true;
      const bodyPart = line.replace(/^(?:request\s+)?body:\s*/i, '');
      if (bodyPart) bodyLines.push(bodyPart);
      continue;
    }

    // ── Response status line ─────────────────────────────────────────────────
    // Formats: "<- 200 | 272ms" or "<- 200" or "← 200 | {...}"
    const resM = line.match(/^<-\s*(\d{3})\s*[|]?\s*(.*)/);
    if (resM && cur) {
      flushBody();
      const code = parseInt(resM[1]);
      (cur.response as EvidenceApiCall['response']).status      = code;
      (cur.response as EvidenceApiCall['response']).status_text = STATUS_TEXT[code] ?? '';
      inRespBody = true; bodyLines = [];
      // latency: "<- 200 | 272ms" or "<- 200 | 272ms {...}"
      const rest  = resM[2];
      const msM   = rest.match(/^(\d+)ms/);
      if (msM) {
        (cur.response as EvidenceApiCall['response']).response_time_ms = parseInt(msM[1]);
        const bodyPart = rest.replace(/^\d+ms\s*[|]?\s*/, '');
        if (bodyPart) bodyLines.push(bodyPart);
      } else if (rest) {
        bodyLines.push(rest);
      }
      continue;
    }

    // ── Response body / request body continuation ────────────────────────────
    if ((inReqBody || inRespBody) && cur) {
      // Skip meta / label lines that aren't part of the JSON
      if (line.startsWith('[lifecycle]') || line.startsWith('[DEBUG]') || line.startsWith('[push')) continue;
      if (/^response:\s*$/i.test(line)) continue;   // skip "Response:" label line
      if (/^body:\s*$/i.test(line)) continue;        // skip bare "Body:" label (already handled above)
      // Standalone latency "272ms"
      const latM = line.match(/^(\d+)ms$/);
      if (latM && inRespBody) {
        (cur.response as EvidenceApiCall['response']).response_time_ms = parseInt(latM[1]);
        continue;
      }
      // Blank line flushes body
      if (!line) { flushBody(); continue; }
      bodyLines.push(line);
    }
  }

  // Flush last call
  flushBody();
  if (cur?.request?.url) calls.push(cur as EvidenceApiCall);

  return calls;
}

/**
 * Derive a meaningful expected-result string from the test title.
 *
 * Priority:
 *  1. Part after Unicode/ASCII arrow  "→" / "->"  (most specific — e.g. "200 with result_id, is_success=true")
 *  2. Part after em-dash "—" or " - " (description — e.g. "valid request with all required fields")
 *  3. Full title stripped of the "[TC-xxx]" prefix
 */
function expectedFromTitle(title: string): string {
  // Strip ANSI and normalise arrows
  const clean = title.replace(/\x1b\[[0-9;]*m/g, '').trim();

  // 1. After Unicode right arrow → (U+2192) or ASCII ->
  const arrowM = clean.match(/[→](.+)$/) ?? clean.match(/->\s*(.+)$/);
  if (arrowM) return arrowM[1].trim().slice(0, 400);

  // 2. After em-dash — or " — " or " - "
  const dashM = clean.match(/[—–]\s*(.+)$/) ?? clean.match(/\s-\s(.+)$/);
  if (dashM) return dashM[1].trim().slice(0, 400);

  // 3. Strip leading "[TC-xxx]" tag and "Verify" prefix
  return clean
    .replace(/^\[TC-[A-Z0-9./-]+\]\s*/i, '')
    .replace(/^@TC\d+\s*/i, '')
    .replace(/^TC-[A-Z0-9./-]+:\s*/i, '')
    .trim()
    .slice(0, 400);
}

function buildEvidenceJson(e: AdoTcEntry): string {
  const final   = (e.status === 'passed') ? 'PASS' : (e.status === 'skipped') ? 'SKIP' : 'FAIL';
  const ann     = (type: string) => e.annotations.find(a => a.type === type)?.description ?? null;
  // Priority: annotation → parse from title → generic fallback
  const acText  = ann('AcceptanceCriteria') ?? ann('TestData') ?? expectedFromTitle(e.testTitle);
  const notes   = e.annotations.filter(a => a.type === 'Note').map(a => a.description);
  const evidences = e.annotations.filter(a => a.type === 'Evidence').map(a => a.description);
  const reqId   = ann('TestedRequirementID') ?? 'FSD-21.2';

  const host = (ann('TestData') ?? '').match(/https?:\/\/([^/\s]+)/)?.[1]
            ?? 'insurity-dev-microservice1-api-v2-ctc5era3h3euejgj.centralus-01.azurewebsites.net';

  const apiCalls   = parseApiCallsToEvidence(e.stdout, host);
  // Use the last API call for actual_result (include all endpoints — calculate is valid evidence)
  const lastCall   = apiCalls.slice(-1)[0];

  // Build actual_result: Evidence annotations > last API call status > error message > status
  const actualParts = evidences.length > 0
    ? evidences.join(' | ')
    : lastCall
      ? `HTTP ${lastCall.response.status} ${lastCall.response.status_text} | ${lastCall.request.method} .../${lastCall.request.url.split('/').slice(-2).join('/')}${e.errorMessage ? ` | ASSERT: ${e.errorMessage.slice(0, 200)}` : ''}`
      : e.errorMessage
        ? `FAIL — ${e.errorMessage.slice(0, 300)}`
        : final;

  const priority  = e.annotations.find(a => a.type === 'Priority')?.description ?? 'P2-High';

  const doc = {
    evidence_metadata: {
      run_id:         0,          // filled by push-from-report.ts at upload time
      result_id:      0,          // filled by push-from-report.ts at upload time
      suite_id:       parseInt(e.adoSuiteId ?? '0'),
      plan_id:        parseInt(e.adoPlanId  ?? '0'),
      story:          reqId,
      execution_date: new Date().toISOString().slice(0, 10),
      environment:    'QA',
      host,
    },
    test_case: {
      id:       parseInt(e.adoCaseId ?? '0'),
      priority,
      name:     e.testTitle.replace(/^\[TC-[A-Z0-9-]+\]\s*@TC\d+\s*/i, '').replace(/^@TC\d+\s*/i, ''),
      status:   final,
    },
    steps_executed: 4,
    expected_result: acText.slice(0, 500),
    actual_result:   actualParts.slice(0, 500),
    status:          final,
    evidence:        apiCalls,
    remarks: [
      `Suite ${e.adoSuiteId ?? '?'} | Plan ${e.adoPlanId ?? '?'} | ${reqId}`,
      ...notes,
      e.errorMessage ? `FAILURE: ${e.errorMessage.slice(0, 300)}` : null,
    ].filter(Boolean).join(' | '),
  };

  return JSON.stringify(doc, null, 2);
}

// ─── Evidence .html builder ───────────────────────────────────────────────────
function buildEvidenceHtml(e: AdoTcEntry): string {
  const jsonStr = buildEvidenceJson(e);
  let doc: Record<string, unknown>;
  try { doc = JSON.parse(jsonStr); } catch { doc = {}; }

  const meta    = doc.evidence_metadata as Record<string, unknown> ?? {};
  const tc      = doc.test_case        as Record<string, unknown> ?? {};
  const evArr   = (doc.evidence as unknown[]) ?? [];
  const status  = String(doc.status ?? 'FAIL');
  const color   = status === 'PASS' ? '#198754' : status === 'SKIP' ? '#fd7e14' : '#dc3545';
  const bgColor = status === 'PASS' ? '#d1e7dd' : status === 'SKIP' ? '#fff3cd' : '#f8d7da';

  const evidenceBlocks = evArr.map((ev: unknown) => {
    const call = ev as Record<string, unknown>;
    const req  = (call.request  as Record<string, unknown>) ?? {};
    const res  = (call.response as Record<string, unknown>) ?? {};
    const resBody = typeof res.body === 'object' ? JSON.stringify(res.body, null, 2) : String(res.body ?? '');
    const reqPayload = req.payload && req.payload !== null
      ? (typeof req.payload === 'object' ? JSON.stringify(req.payload, null, 2) : String(req.payload))
      : null;
    const statusCode = Number(res.status ?? 0);
    const resColor = statusCode >= 200 && statusCode < 300 ? '#198754' : '#dc3545';

    return `
    <div style="border:1px solid #dee2e6;border-radius:6px;margin-bottom:16px;overflow:hidden">
      <div style="background:#0d6efd;color:#fff;padding:8px 14px;font-weight:600;font-size:13px">
        ${String(call.label ?? '')}
      </div>
      <div style="padding:12px 14px;background:#f8f9fa">
        <div style="margin-bottom:10px">
          <span style="background:#0d6efd;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold;margin-right:8px">${String(req.method ?? 'GET')}</span>
          <code style="font-size:12px;word-break:break-all">${String(req.url ?? '')}</code>
        </div>
        ${reqPayload ? `<div style="margin-bottom:10px"><b style="font-size:12px">REQUEST BODY:</b><pre style="background:#272822;color:#f8f8f2;padding:10px;border-radius:4px;font-size:11px;overflow-x:auto;margin:4px 0">${reqPayload.replace(/</g,'&lt;')}</pre></div>` : ''}
        <div>
          <span style="background:${resColor};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold;margin-right:8px">${statusCode} ${String(res.status_text ?? '')}</span>
          <span style="color:#6c757d;font-size:12px">${String(res.response_time_ms ?? 0)}ms</span>
        </div>
        <div style="margin-top:8px"><b style="font-size:12px">RESPONSE BODY:</b><pre style="background:#272822;color:#f8f8f2;padding:10px;border-radius:4px;font-size:11px;overflow-x:auto;margin:4px 0;max-height:400px">${resBody.replace(/</g,'&lt;')}</pre></div>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evidence — TC ${String(tc.id ?? '')} — ${status}</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:20px;background:#f5f5f5;color:#212529}
  .card{background:#fff;border-radius:8px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px}
  .label{color:#6c757d;font-size:11px;text-transform:uppercase;font-weight:600}
  .val{font-size:13px;font-weight:500}
  h2{margin:0 0 4px;font-size:18px}
  h3{margin:0 0 12px;font-size:15px;color:#495057;border-bottom:1px solid #dee2e6;padding-bottom:6px}
  pre{white-space:pre-wrap;word-break:break-word}
</style></head><body>

<div class="card" style="border-left:5px solid ${color}">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <h2>TC ${String(tc.id ?? '')} — ${String(tc.name ?? '').replace(/</g,'&lt;')}</h2>
      <span class="badge" style="background:${color};color:#fff">${status}</span>
      &nbsp;<span class="badge" style="background:#6c757d;color:#fff">${String(tc.priority ?? '')}</span>
    </div>
  </div>
</div>

<div class="card">
  <h3>Execution Metadata</h3>
  <div class="grid">
    <div><div class="label">Suite ID</div><div class="val">${String(meta.suite_id ?? '')}</div></div>
    <div><div class="label">Plan ID</div><div class="val">${String(meta.plan_id ?? '')}</div></div>
    <div><div class="label">Run ID</div><div class="val">${String(meta.run_id ?? 0) === '0' ? '(assigned on push)' : String(meta.run_id)}</div></div>
    <div><div class="label">Result ID</div><div class="val">${String(meta.result_id ?? 0) === '0' ? '(assigned on push)' : String(meta.result_id)}</div></div>
    <div><div class="label">User Story</div><div class="val">${String(meta.story ?? '')}</div></div>
    <div><div class="label">Date</div><div class="val">${String(meta.execution_date ?? '')}</div></div>
    <div><div class="label">Environment</div><div class="val">${String(meta.environment ?? '')}</div></div>
    <div><div class="label">Host</div><div class="val" style="font-size:11px;word-break:break-all">${String(meta.host ?? '')}</div></div>
  </div>
</div>

<div class="card">
  <h3>Test Result</h3>
  <div style="margin-bottom:10px"><div class="label">Expected Result</div><div class="val" style="margin-top:4px">${String(doc.expected_result ?? '').replace(/</g,'&lt;')}</div></div>
  <div style="margin-bottom:10px"><div class="label">Actual Result</div><div class="val" style="margin-top:4px;background:${bgColor};padding:6px 10px;border-radius:4px">${String(doc.actual_result ?? '').replace(/</g,'&lt;')}</div></div>
  <div><div class="label">Remarks</div><div class="val" style="margin-top:4px;color:#6c757d;font-size:12px">${String(doc.remarks ?? '').replace(/</g,'&lt;')}</div></div>
</div>

<div class="card">
  <h3>API Evidence (${evArr.length} call${evArr.length !== 1 ? 's' : ''})</h3>
  ${evidenceBlocks || '<p style="color:#6c757d">No API calls recorded.</p>'}
</div>

</body></html>`;
}

// ─── Evidence .txt builder ────────────────────────────────────────────────────

// ─── stdout parser — extracts request / response blocks from apiLog() output ──
// apiLog() writes:  "→ POST /api/v1/..."  "  Body: {...}"  "← 200 | 450ms"  "  Body: {...}"
function parseStdout(stdout: string): { request: string; response: string } {
  if (!stdout) return { request: '', response: '' };

  // Strip ANSI colour codes
  const clean = stdout.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
  const lines = clean.split('\n');

  const reqLines: string[] = [];
  const resLines: string[] = [];
  let section: 'req' | 'res' | null = null;

  for (const line of lines) {
    if (/^\s*→\s/.test(line) || /^->\s/.test(line)) {
      section = 'req';
      reqLines.push(line.trim());
    } else if (/^\s*←\s/.test(line) || /^<-\s/.test(line)) {
      section = 'res';
      resLines.push(line.trim());
    } else if (section === 'req' && line.trim()) {
      reqLines.push(line.trim());
    } else if (section === 'res' && line.trim()) {
      resLines.push(line.trim());
    } else if (!line.trim()) {
      section = null;   // blank line resets section
    }
  }

  // Also capture lines that look like:  "Method:", "URL:", "Status:", "Body:"
  if (reqLines.length === 0) {
    lines.filter(l => /\b(Method|URL|Headers|Payload|Request)\b/i.test(l)).forEach(l => reqLines.push(l.trim()));
  }
  if (resLines.length === 0) {
    lines.filter(l => /\b(Status|Response|Body|Latency|HTTP\s+\d)\b/i.test(l)).forEach(l => resLines.push(l.trim()));
  }

  return {
    request:  reqLines.join('\n  '),
    response: resLines.join('\n  '),
  };
}

function buildEvidenceTxt(e: AdoTcEntry): string {
  const sep   = '='.repeat(62);
  const div   = '-'.repeat(62);
  const final = (e.status === 'passed') ? 'PASS' : (e.status === 'skipped') ? 'SKIP' : 'FAIL';

  const ann = (type: string): string | null =>
    e.annotations.find(a => a.type === type)?.description ?? null;

  const tcTag      = e.tcTag      ?? e.adoCaseId ?? 'N/A';
  const acText     = ann('AcceptanceCriteria') ?? ann('TestData') ?? expectedFromTitle(e.testTitle);
  const precon     = ann('PreCondition')       ?? '(see test case in ADO)';
  const testData   = ann('TestData')           ?? '(see test case in ADO)';
  const evidences  = e.annotations.filter(a => a.type === 'Evidence').map(a => a.description);
  const notes      = e.annotations.filter(a => a.type === 'Note').map(a => a.description);
  const otherAnns  = e.annotations.filter(a => ![
    'TestCaseID','ADO_CaseID','ADO_SuiteID','ADO_PlanID',
    'PreCondition','TestData','AcceptanceCriteria','Evidence','Note',
  ].includes(a.type));

  // Parse stdout to extract individual API call blocks (Request + Response pairs)
  const cleanStdout = e.stdout.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
  const stdoutLines = cleanStdout.split('\n');

  // Collect all request/response pairs from stdout
  type ApiCall = { url: string; method: string; reqBody: string; status: string; respBody: string };
  const apiCalls: ApiCall[] = [];
  let cur: Partial<ApiCall> | null = null;
  let inBody = false;
  let bodyLines: string[] = [];

  for (const raw of stdoutLines) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();
    // New request line: -> METHOD URL  OR  [lifecycle] METHOD URL
    const reqMatch = line.match(/^(?:->\s*|(?:\[lifecycle\]\s*))(GET|POST|PATCH|DELETE|PUT)\s+(https?:\/\/.+)/);
    if (reqMatch) {
      if (cur && cur.url) apiCalls.push(cur as ApiCall);
      cur = { method: reqMatch[1], url: reqMatch[2], reqBody: '', status: '', respBody: '' };
      inBody = false; bodyLines = [];
      continue;
    }
    // Request body line (after -> or body: prefix)
    if (cur && !cur.status && (line.startsWith('body:') || line.startsWith('Body:') || line.startsWith('Request Body:'))) {
      inBody = true; bodyLines = [line.replace(/^(body:|Body:|Request Body:)\s*/i, '').trim()]; continue;
    }
    // Response line: <- STATUS
    const resMatch = line.match(/^<-\s*(\d+)\s*\|?\s*(.*)/);
    if (resMatch && cur) {
      if (inBody && bodyLines.length > 0) { cur.reqBody = bodyLines.join('\n'); }
      inBody = false; bodyLines = [];
      cur.status = resMatch[1]; cur.respBody = resMatch[2]; continue;
    }
    // Response body continuation (lines after <- status)
    if (cur?.status && line && !line.startsWith('->') && !line.startsWith('[lifecycle]') && !line.startsWith('[DEBUG]') && !line.startsWith('✓') && !line.startsWith('TC-')) {
      cur.respBody = (cur.respBody + '\n' + line).slice(0, 1500); continue;
    }
    // Request body continuation
    if (inBody && cur && !cur.status && line) {
      bodyLines.push(line);
    }
  }
  if (cur && cur.url) apiCalls.push(cur as ApiCall);

  // Format each API call for the evidence section
  const evidenceBlock = apiCalls.map((c, i) => {
    const reqB = c.reqBody ? `  Body   : ${c.reqBody.slice(0, 800)}` : '';
    const resB = c.respBody ? `  Body   : ${c.respBody.slice(0, 800)}` : '';
    return [
      `--- API Call ${i + 1} ---`,
      `REQUEST:`,
      `  Method : ${c.method}`,
      `  URL    : ${c.url}`,
      reqB,
      `RESPONSE:`,
      `  Status : HTTP ${c.status}`,
      resB,
    ].filter(l => l !== undefined && l !== '').join('\n');
  }).join('\n\n') || '(console logs not captured -- test uses framework helpers)';

  // Summary for ACTUAL RESULT
  const lastCall      = apiCalls[apiCalls.length - 1];
  const actualSummary = lastCall
    ? `HTTP ${lastCall.status} | ${lastCall.method} ${lastCall.url.split('?')[0]}`
    : (evidences[evidences.length - 1] ?? '(see API CALL LOG below)');

  // Failure detail
  const failBlock = e.errorMessage
    ? `\n${div}\nERRORS:\n  ${e.errorMessage.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 800)}\n`
    : '';

  // Note block
  const noteBlock = notes.length > 0
    ? `\n${div}\nNOTE:\n  ${notes.join('\n  ')}\n`
    : '';

  // Other custom annotations (mirrors Playwright report layout)
  const otherBlock = otherAnns.length > 0
    ? `\n${div}\nOTHER ANNOTATIONS:\n` + otherAnns.map(a => `  [${a.type}]: ${a.description}`).join('\n') + '\n'
    : '';

  // Full API call log from stdout
  const apiLogBlock = apiCalls.length > 0
    ? apiCalls.map((c, i) => {
        const reqB = c.reqBody ? `\n  Body   : ${c.reqBody.slice(0, 1000)}` : '';
        const resB = c.respBody ? `\n  Body   : ${c.respBody.slice(0, 1000)}` : '';
        return `--- API Call ${i + 1} (${c.method}) ---\nREQUEST:\n  Method : ${c.method}\n  URL    : ${c.url}${reqB}\nRESPONSE:\n  Status : HTTP ${c.status}${resB}`;
      }).join('\n\n')
    : '(no API calls captured in stdout)';

  const remarks = (e.status === 'skipped')
    ? 'Test skipped — see Note section above'
    : final === 'PASS'
      ? 'All assertions passed successfully'
      : 'Test failed — see ERRORS and API CALL LOG sections above';

  // ── Map API calls to the 4 test steps ────────────────────────────────────────
  // Step 1 = lifecycle calls (all POST to /rateplans/*)
  // Step 2 = calculate call (POST to /occurrences/calculate)
  // Step 3 = target endpoint (GET to the endpoint being tested)
  // Step 4 = validation (derived from Evidence annotations)
  const lifecycleCalls = apiCalls.filter(c => c.url.includes('/rateplans'));
  const calcCall       = apiCalls.find(c  => c.url.includes('/occurrences/calculate'));
  const targetCalls    = apiCalls.filter(c => !c.url.includes('/rateplans') && !c.url.includes('/occurrences/calculate'));

  const step1Status = lifecycleCalls.length > 0 && lifecycleCalls.every(c => ['200','201','204'].includes(c.status)) ? 'PASS ✓' : lifecycleCalls.length === 0 ? 'N/A' : 'FAIL ✗';
  const step2Status = calcCall ? (['200','201'].includes(calcCall.status) ? 'PASS ✓' : `FAIL ✗ (HTTP ${calcCall.status})`) : 'N/A (no calculate call)';
  const step3Status = targetCalls.length > 0 ? (targetCalls.every(c => ['200','201','204','400','404','422'].includes(c.status)) ? `${targetCalls[targetCalls.length-1].status}` : `HTTP ${targetCalls[targetCalls.length-1].status}`) : 'N/A';
  const step4Status = final;

  const lastLifecycle = lifecycleCalls[lifecycleCalls.length - 1];
  const lastTarget    = targetCalls[targetCalls.length - 1];

  // Clean test title (remove TC tag prefix for readability)
  const cleanTitle = e.testTitle.replace(/^\[TC-[A-Z]+-\d+\]\s*@TC\d+\s*/i, '').replace(/^@TC\d+\s*/i, '');

  return [
    sep,
    'TEST EXECUTION REPORT',
    sep,
    `Test Case ID  : ${tcTag}`,
    `ADO Case ID   : ${e.adoCaseId ?? '(pending)'}  |  Suite: ${e.adoSuiteId}  |  Plan: ${e.adoPlanId}`,
    `Test Case Name: ${cleanTitle}`,
    `Duration      : ${e.durationMs}ms`,
    `Executed      : Run ID ${e.adoSuiteId ? 'see ADO run' : 'local'}`,
    sep,
    '',
    // ── What this test verifies ───────────────────────────────────────────────
    'WHAT THIS TEST VERIFIES:',
    div,
    `  ${acText}`,
    '',
    sep,
    '',
    // ── Step-by-step execution ────────────────────────────────────────────────
    'STEP-BY-STEP EXECUTION:',
    sep,
    '',
    'Step 1: Rate Plan Lifecycle',
    div,
    `  Action  : Create Rate Plan → Submit → Approve → Pending Activation → Activate`,
    lifecycleCalls.length > 0
      ? `  Result  : ${lifecycleCalls.map(c => `${c.method} ${c.url.split('/').slice(-2).join('/')} → HTTP ${c.status}`).join(' | ')}`
      : `  Result  : Lifecycle not executed for this test`,
    lastLifecycle ? `  version_id: ${(lastLifecycle.respBody.match(/"version_id":"([^"]+)"/) || [])[1] ?? 'see API log'}` : '',
    `  Status  : ${step1Status}`,
    '',
    'Step 2: Calculate Occurrence Premium',
    div,
    `  Action  : POST /api/v1/ratingengine/occurrences/calculate`,
    calcCall
      ? `  Payload : ${calcCall.reqBody.slice(0, 200).replace(/\s+/g, ' ')}`
      : `  Payload : (no calculate call made)`,
    calcCall
      ? `  Result  : HTTP ${calcCall.status} | result_id = ${(calcCall.respBody.match(/"result_id":"([^"]+)"/) || [])[1] ?? 'not in response'}`
      : `  Result  : Calculate not called`,
    `  Status  : ${step2Status}`,
    '',
    'Step 3: Call Target Endpoint',
    div,
    ...targetCalls.map((c, i) => [
      `  [Call ${i+1}] ${c.method} ${c.url}`,
      `  Response : HTTP ${c.status}`,
      c.respBody ? `  Body     : ${c.respBody.replace(/\n/g, ' ').slice(0, 300)}` : '',
    ].filter(Boolean).join('\n')),
    targetCalls.length === 0 ? '  (no target endpoint calls)' : '',
    `  Status   : HTTP ${step3Status}`,
    '',
    'Step 4: Validate Response',
    div,
    ...(evidences.map(ev => `  ✓ ${ev}`)),
    evidences.length === 0 ? '  (see API log for validation details)' : '',
    `  Status  : ${step4Status === 'PASS' ? 'PASS ✓ All assertions passed' : step4Status === 'FAIL' ? 'FAIL ✗ See Errors section' : 'SKIP ⏭'}`,
    '',
    sep,
    '',
    // ── Overall verdict ───────────────────────────────────────────────────────
    `OVERALL STATUS: ${final === 'PASS' ? 'PASS ✓' : final === 'FAIL' ? 'FAIL ✗' : 'SKIP ⏭'}`,
    `EVIDENCE      : ${actualSummary}`,
    '',
    // ── Errors ────────────────────────────────────────────────────────────────
    failBlock,
    // ── Notes ─────────────────────────────────────────────────────────────────
    noteBlock,
    otherBlock,
    sep,
    '',
    // ── Full API Call Log ─────────────────────────────────────────────────────
    `API CALL LOG (${apiCalls.length} calls captured):`,
    div,
    apiLogBlock,
    sep,
    '',
    `REMARKS: ${remarks}`,
    sep,
  ].filter(l => l !== null && l !== undefined).join('\n');
}

// ─── Reporter class ───────────────────────────────────────────────────────────

class AdoTcReporter implements Reporter {
  private readonly entries: AdoTcEntry[] = [];
  private outputDir  = 'test-results';
  private evidenceDir = 'test-results/evidence';

  onBegin(_config: FullConfig, _suite: Suite): void {
    // __dirname = integrations/ado/reporters/ → go up 3 levels to project root
    const projectRoot = path.resolve(__dirname, '../../../');
    this.outputDir   = path.join(projectRoot, 'test-results', 'reports');
    this.evidenceDir = path.join(projectRoot, 'test-results', 'evidence');
    if (!fs.existsSync(this.outputDir))   fs.mkdirSync(this.outputDir,   { recursive: true });
    if (!fs.existsSync(this.evidenceDir)) fs.mkdirSync(this.evidenceDir, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // ── Read annotations ────────────────────────────────────────────────────
    const ann = (k: string): string | null =>
      test.annotations.find(a => a.type === k)?.description ?? null;

    const tcTag     = ann('TestCaseID');
    const adoCaseId = ann('ADO_CaseID');
    const suiteId   = ann('ADO_SuiteID');
    const planId    = ann('ADO_PlanID');

    // Debug: log every test's annotation resolution
    // ADO_CaseID = ADO workItem.id — the "TEST CASE <ID>" shown in ADO Test Plan UI
    console.log(
      `[DEBUG ado-reporter] "${test.title.slice(0, 55)}"` +
      `  tcTag=${tcTag ?? '—'}  workItem.id=${adoCaseId ?? '—'}  suite=${suiteId ?? '—'}`
    );

    // Collapse error message to single line
    const rawErr = result.errors?.[0]?.message ?? null;
    const errorMessage = rawErr
      ? rawErr.replace(/\x1b\[[0-9;]*m/g, '').split('\n').find(l => l.trim()) ?? null
      : null;

    // Capture all annotations for evidence report
    const annotations: AdoAnnotation[] = test.annotations
      .filter(a => a.type && a.description)
      .map(a => ({ type: a.type, description: a.description ?? '' }));

    // Capture console output — apiLog() writes request/response here
    // result.stdout is Buffer[] | string[] — normalise to plain string
    const stdout = (result.stdout ?? [])
      .map((chunk: Buffer | string) =>
        typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
      .join('')
      .replace(/\r/g, '')
      .slice(0, 8000);  // cap at 8KB

    const entry: AdoTcEntry = {
      testTitle:  test.title,
      tcTag,
      adoCaseId,
      adoSuiteId: suiteId,
      adoPlanId:  planId,
      status:     result.status,
      durationMs: result.duration,
      errorMessage,
      retries:    result.retry,
      annotations,
      stdout,
    };

    this.entries.push(entry);

    // Write per-test evidence JSON (so push-from-report.ts can upload it)
    // File name: {adoCaseId}-Result.json  (falls back to sanitized TC tag)
    const fileKey  = adoCaseId ?? (tcTag ?? 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
    const jsonPath = path.join(this.evidenceDir, `${fileKey}-Result.json`);
    const htmlPath = path.join(this.evidenceDir, `${fileKey}-Result.html`);
    const txtPath  = path.join(this.evidenceDir, `${fileKey}-Result.txt`);
    try {
      const jsonContent = buildEvidenceJson(entry);
      fs.writeFileSync(jsonPath, jsonContent, 'utf8');
      fs.writeFileSync(htmlPath, buildEvidenceHtml(entry), 'utf8');
      fs.writeFileSync(txtPath,  buildEvidenceTxt(entry),  'utf8');
    } catch { /* non-fatal */ }
  }

  onEnd(_result: FullResult): void {
    if (this.entries.length === 0) return;

    this._printTable();
    this._writeJson();
  }

  // ─── Console table ──────────────────────────────────────────────────────────

  private _printTable(): void {
    // Group by suite
    const bySuite = new Map<string, AdoTcEntry[]>();
    for (const e of this.entries) {
      const key = e.adoSuiteId ?? 'unknown';
      const arr = bySuite.get(key) ?? [];
      arr.push(e);
      bySuite.set(key, arr);
    }

    const C_ID    = 10;   // ADO ID column
    const C_TITLE = 52;   // test title column
    const C_STAT  = 8;    // status column
    const C_TIME  = 7;    // duration column
    const TOTAL   = C_ID + C_TITLE + C_STAT + C_TIME + 7; // 7 = separators

    const hr  = (ch: string) => ch.repeat(TOTAL);
    const sep = `+${'-'.repeat(C_ID)}+${'-'.repeat(C_TITLE)}+${'-'.repeat(C_STAT)}+${'-'.repeat(C_TIME)}+`;

    for (const [suiteId, entries] of bySuite.entries()) {
      const planId = entries[0]?.adoPlanId ?? '?';
      const header = `  ADO Test Case Report — Suite ${suiteId} (Plan ${planId})  `;

      console.log('');
      console.log(BOLD + CYAN + '┌' + hr('─') + '┐' + RESET);
      console.log(BOLD + CYAN + '│' + RESET + BOLD + pad(header, TOTAL) + CYAN + '│' + RESET);
      console.log(CYAN + sep + RESET);
      console.log(
        CYAN + '│' + RESET +
        BOLD + pad(' ADO ID',    C_ID)    + RESET + CYAN + '│' + RESET +
        BOLD + pad(' Test Case Title / TC Tag',  C_TITLE) + RESET + CYAN + '│' + RESET +
        BOLD + pad(' Status',    C_STAT)  + RESET + CYAN + '│' + RESET +
        BOLD + pad('   Time', C_TIME)     + RESET + CYAN + '│' + RESET
      );
      console.log(CYAN + sep + RESET);

      let pass = 0, fail = 0, skip = 0;

      for (const e of entries) {
        const idCell    = pad(' ' + (e.adoCaseId ?? '(pending)'), C_ID);
        const titleCell = pad(' ' + (e.tcTag ? `${e.tcTag}` : e.testTitle.slice(0, C_TITLE - 2)), C_TITLE);
        const statRaw   = statusLabel(e.status);
        const statCell  = pad(' ' + statRaw, C_STAT);
        const timeCell  = pad(' ' + (e.status === 'skipped' ? '---' : fmtMs(e.durationMs)), C_TIME);
        const color     = statusColor(e.status);

        console.log(
          CYAN + '│' + RESET +
          DIM  + idCell    + RESET + CYAN + '│' + RESET +
               titleCell   +         CYAN + '│' + RESET +
          color + statCell + RESET + CYAN + '│' + RESET +
          DIM  + timeCell  + RESET + CYAN + '│' + RESET
        );

        // Error line (indented below, within title column)
        if (e.errorMessage) {
          const errText = `   ↳ ${e.errorMessage}`.slice(0, C_TITLE - 1);
          console.log(
            CYAN + '│' + RESET +
            ' '.repeat(C_ID)  + CYAN + '│' + RESET +
            '\x1b[31m' + pad(errText, C_TITLE) + RESET + CYAN + '│' + RESET +
            ' '.repeat(C_STAT)  + CYAN + '│' + RESET +
            ' '.repeat(C_TIME)  + CYAN + '│' + RESET
          );
        }

        if (e.status === 'passed')                                      pass++;
        else if (e.status === 'failed' || e.status === 'timedOut')      fail++;
        else if (e.status === 'skipped')                                skip++;
      }

      console.log(CYAN + sep + RESET);

      // Summary row
      const summary = ` ${pass} passed · ${fail} failed · ${skip} skipped`;
      console.log(BOLD + CYAN + '│' + RESET + BOLD + pad(summary, TOTAL) + CYAN + '│' + RESET);
      console.log(CYAN + '└' + hr('─') + '┘' + RESET);
      console.log('');
    }
  }

  // ─── JSON output ────────────────────────────────────────────────────────────

  private _writeJson(): void {
    const outPath = path.join(this.outputDir, 'ado-tc-report.json');
    const payload = {
      generatedAt: new Date().toISOString(),
      summary: {
        total:   this.entries.length,
        passed:  this.entries.filter(e => e.status === 'passed').length,
        failed:  this.entries.filter(e => e.status === 'failed' || e.status === 'timedOut').length,
        skipped: this.entries.filter(e => e.status === 'skipped').length,
      },
      results: this.entries.map(e => ({
        adoCaseId:    e.adoCaseId ?? null,
        tcTag:        e.tcTag     ?? null,
        adoSuiteId:   e.adoSuiteId,
        adoPlanId:    e.adoPlanId,
        testTitle:    e.testTitle,
        status:       e.status,
        durationMs:   e.durationMs,
        errorMessage: e.errorMessage ?? null,
        // Evidence annotations for push-results.ts attachment upload
        evidenceFile: `${(e.adoCaseId ?? (e.tcTag ?? 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_'))}-Result.json`,
        annotations:  e.annotations,
        stdout:       e.stdout,
      })),
    };

    try {
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`\n[ado-tc-reporter] Report written → ${outPath}`);
    } catch (err) {
      console.warn(`[ado-tc-reporter] Could not write report: ${err}`);
    }
  }
}

export default AdoTcReporter;
