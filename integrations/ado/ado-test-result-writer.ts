// File: integrations/ado/ado-test-result-writer.ts
import * as azdev from 'azure-devops-node-api';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { config } from '../../src/config/project.config';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export interface TestResultItem {
  caseId: number;
  outcome: 'passed' | 'failed' | 'skipped' | 'timedOut';
  durationMs?: number;
  errorMessage?: string;
}

interface RunStats {
  passRate: number;
  runUrl: string;
}

// ---------------------------------------------------------------------------
// Outcome mapping
// ---------------------------------------------------------------------------
const OUTCOME_MAP: Record<TestResultItem['outcome'], string> = {
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'NotExecuted',
  timedOut: 'Failed',
};

// ---------------------------------------------------------------------------
// AdoTestResultWriter
// ---------------------------------------------------------------------------
export class AdoTestResultWriter {
  constructor(
    private readonly connection: azdev.WebApi,
    private readonly projectName: string
  ) {}

  /**
   * Create a new ADO test run and return its run ID.
   */
  async createRun(planId: number, suiteId: number, name: string): Promise<number> {
    const testApi = await this.connection.getTestApi();

    const runModel = {
      name,
      plan: { id: String(planId) },
      isAutomated: true,
    };

    const run = await testApi.createTestRun(
      runModel as unknown as Parameters<typeof testApi.createTestRun>[0],
      this.projectName
    );

    if (!run?.id) {
      throw new Error(`Failed to create test run — no ID returned for plan ${planId}`);
    }

    return run.id;
  }

  /**
   * Batch-update test results for a run.
   * Automatically maps outcomes: passed→Passed, failed→Failed,
   * skipped→NotExecuted, timedOut→Failed (with optional error annotation).
   */
  async batchUpdateResults(runId: number, results: TestResultItem[]): Promise<void> {
    if (results.length === 0) return;

    const testApi = await this.connection.getTestApi();

    // Fetch existing results to map caseId → resultId
    const existingResults = await testApi.getTestResults(this.projectName, runId);

    const updates = results.map(item => {
      const adoOutcome = OUTCOME_MAP[item.outcome];
      const existing = existingResults?.find(
        r => r.testCase?.id === String(item.caseId)
      );

      let errorMessage = item.errorMessage ?? '';
      if (item.outcome === 'timedOut' && !errorMessage) {
        errorMessage = 'Test timed out during execution';
      }

      return {
        id: existing?.id,
        testCase: { id: String(item.caseId) },
        outcome: adoOutcome,
        durationInMs: item.durationMs,
        errorMessage: errorMessage || undefined,
        state: 'Completed',
      };
    }).filter(u => u.id !== undefined);

    if (updates.length === 0) return;

    // ADO batch update has a limit of 1000 results per call
    const BATCH_SIZE = 1000;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      await testApi.updateTestResults(
        batch as unknown as Parameters<typeof testApi.updateTestResults>[0],
        this.projectName,
        runId
      );
    }
  }

  /**
   * Upload a Playwright report as a ZIP attachment to an ADO test run.
   * If reportPath is a directory, zips it first; if already a .zip, uploads directly.
   */
  async uploadReport(runId: number, reportPath: string): Promise<void> {
    const testApi = await this.connection.getTestApi();

    let zipPath: string;
    let cleanupZip = false;

    if (fs.statSync(reportPath).isDirectory()) {
      zipPath = path.join(path.dirname(reportPath), `playwright-report-${runId}.zip`);
      await this.zipDirectory(reportPath, zipPath);
      cleanupZip = true;
    } else if (reportPath.endsWith('.zip')) {
      zipPath = reportPath;
    } else {
      throw new Error(`reportPath must be a directory or a .zip file, got: ${reportPath}`);
    }

    const fileContent = fs.readFileSync(zipPath);
    const attachmentName = path.basename(zipPath);

    const attachmentDetails = {
      attachmentType: 'GeneralAttachment',
      comment: 'Playwright report uploaded by EAIS automation',
      fileName: attachmentName,
      stream: fileContent.toString('base64'),
    };

    await testApi.createTestRunAttachment(
      attachmentDetails as unknown as Parameters<typeof testApi.createTestRunAttachment>[0],
      this.projectName,
      runId
    );

    if (cleanupZip && fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
  }

  /**
   * Upload per-result evidence .txt files from test-results/evidence/ to each
   * matching test result in the given run.
   *
   * Called automatically by push-results.ts after batchUpdateResults().
   * Works for ALL suites — no per-suite configuration needed.
   *
   * File naming convention (set by ado-tc-reporter.ts):
   *   test-results/evidence/{adoCaseId}-Result.txt
   *
   * If the file exists for a given caseId, it is uploaded as a result-level
   * attachment (visible in the Attachments tab when clicking that test result).
   * If no file exists, the result is silently skipped.
   */
  async uploadResultEvidence(runId: number, evidenceDir: string): Promise<number> {
    if (!fs.existsSync(evidenceDir)) return 0;

    const testApi = await this.connection.getTestApi();
    const existingResults = await testApi.getTestResults(this.projectName, runId);
    if (!existingResults || existingResults.length === 0) return 0;

    // Build TC-tag → file map from ado-tc-report.json for fallback lookup
    const reportPath = path.join(evidenceDir, '..', 'reports', 'ado-tc-report.json');
    const caseIdToTag = new Map<string, string>();
    try {
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
          results: Array<{ adoCaseId: string | null; tcTag: string | null; evidenceFile?: string }>
        };
        for (const r of report.results) {
          if (r.adoCaseId && r.tcTag) caseIdToTag.set(r.adoCaseId, r.tcTag);
        }
      }
    } catch { /* non-fatal */ }

    let uploaded = 0;

    for (const result of existingResults) {
      const caseId   = result.testCase?.id;
      const resultId = result.id;
      if (!caseId || !resultId) continue;

      // Try by ADO case ID first, then by TC tag (fallback for suites without tc-map)
      const tcTag    = caseIdToTag.get(caseId);
      const tryPaths = [
        path.join(evidenceDir, `${caseId}-Result.txt`),
        ...(tcTag ? [path.join(evidenceDir, `${tcTag}-Result.txt`)] : []),
        ...(tcTag ? [path.join(evidenceDir, `${tcTag.replace(/[^a-zA-Z0-9._-]/g, '_')}-Result.txt`)] : []),
      ];
      const txtPath = tryPaths.find(p => fs.existsSync(p));
      if (!txtPath) continue;

      try {
        const content  = fs.readFileSync(txtPath, 'utf8');
        const b64      = Buffer.from(content, 'utf8').toString('base64');
        const fileName = `${caseId}-Result.txt`;

        const attachment = {
          attachmentType: 'GeneralAttachment',
          comment:        `Evidence for TC ${caseId} — auto-uploaded by EAIS automation`,
          fileName,
          stream:         b64,
        };

        await testApi.createTestResultAttachment(
          attachment as unknown as Parameters<typeof testApi.createTestResultAttachment>[0],
          this.projectName,
          runId,
          resultId
        );

        uploaded++;
        console.log(`  [evidence] Uploaded ${fileName} → result ${resultId} (case ${caseId})`);
      } catch (err) {
        console.warn(
          `  [evidence] WARNING: Could not upload evidence for case ${caseId}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    return uploaded;
  }

  /**
   * Mark a run as Completed and return pass rate + run URL.
   */
  async completeRun(runId: number): Promise<RunStats> {
    const testApi = await this.connection.getTestApi();

    await testApi.updateTestRun(
      { state: 'Completed' } as unknown as Parameters<typeof testApi.updateTestRun>[0],
      this.projectName,
      runId
    );

    const stats = await testApi.getTestRunStatistics(this.projectName, runId);

    const passed = stats?.runStatistics?.find(s => s.outcome === 'Passed')?.count ?? 0;
    const total = stats?.runStatistics?.reduce((sum, s) => sum + (s.count ?? 0), 0) ?? 0;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    const orgUrl = config.ado.orgUrl;
    const project = encodeURIComponent(this.projectName);
    const runUrl = `${orgUrl}/${project}/_testManagement/runs?runId=${runId}`;

    return { passRate, runUrl };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Zip all files in a directory recursively into a target zip file.
   * Uses Node built-ins only (zlib + fs streams).
   */
  private async zipDirectory(sourceDir: string, destZip: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(destZip);
      // Simple tar-like: write each file as a compressed entry
      // For production, use archiver or adm-zip. This is a built-in fallback.
      const entries: Array<{ relPath: string; absPath: string }> = [];
      this.collectFiles(sourceDir, sourceDir, entries);

      const buffers: Buffer[] = [];

      // Write a minimal ZIP structure using zlib deflate for each file
      let offset = 0;
      const centralDir: Buffer[] = [];

      const processNext = (idx: number) => {
        if (idx >= entries.length) {
          // Write central directory + end record
          const cdBuf = Buffer.concat(centralDir);
          const endRecord = Buffer.alloc(22);
          endRecord.writeUInt32LE(0x06054b50, 0); // end of central dir signature
          endRecord.writeUInt16LE(0, 4); // disk number
          endRecord.writeUInt16LE(0, 6); // disk with cd start
          endRecord.writeUInt16LE(entries.length, 8); // entries on disk
          endRecord.writeUInt16LE(entries.length, 10); // total entries
          endRecord.writeUInt32LE(cdBuf.length, 12); // cd size
          endRecord.writeUInt32LE(offset, 16); // cd offset
          endRecord.writeUInt16LE(0, 20); // comment length

          output.write(cdBuf);
          output.write(endRecord);
          output.end();
          output.on('finish', resolve);
          output.on('error', reject);
          return;
        }

        const entry = entries[idx];
        const fileData = fs.readFileSync(entry.absPath);
        const compressed = zlib.deflateRawSync(fileData);
        const nameBytes = Buffer.from(entry.relPath, 'utf8');

        // Local file header
        const localHeader = Buffer.alloc(30 + nameBytes.length);
        localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
        localHeader.writeUInt16LE(20, 4); // version needed
        localHeader.writeUInt16LE(0, 6); // general purpose bit flag
        localHeader.writeUInt16LE(8, 8); // compression method: deflate
        localHeader.writeUInt16LE(0, 10); // last mod file time
        localHeader.writeUInt16LE(0, 12); // last mod file date
        localHeader.writeUInt32LE(0, 14); // crc-32 (simplified — 0 for compatibility)
        localHeader.writeUInt32LE(compressed.length, 18); // compressed size
        localHeader.writeUInt32LE(fileData.length, 22); // uncompressed size
        localHeader.writeUInt16LE(nameBytes.length, 26); // file name length
        localHeader.writeUInt16LE(0, 28); // extra field length
        nameBytes.copy(localHeader, 30);

        output.write(localHeader);
        output.write(compressed);

        // Central directory entry
        const cdEntry = Buffer.alloc(46 + nameBytes.length);
        cdEntry.writeUInt32LE(0x02014b50, 0); // central dir signature
        cdEntry.writeUInt16LE(20, 4); // version made by
        cdEntry.writeUInt16LE(20, 6); // version needed
        cdEntry.writeUInt16LE(0, 8); // flags
        cdEntry.writeUInt16LE(8, 10); // compression method
        cdEntry.writeUInt16LE(0, 12); // mod time
        cdEntry.writeUInt16LE(0, 14); // mod date
        cdEntry.writeUInt32LE(0, 16); // crc-32
        cdEntry.writeUInt32LE(compressed.length, 20); // compressed size
        cdEntry.writeUInt32LE(fileData.length, 24); // uncompressed size
        cdEntry.writeUInt16LE(nameBytes.length, 28); // file name length
        cdEntry.writeUInt16LE(0, 30); // extra field length
        cdEntry.writeUInt16LE(0, 32); // file comment length
        cdEntry.writeUInt16LE(0, 34); // disk number start
        cdEntry.writeUInt16LE(0, 36); // internal file attributes
        cdEntry.writeUInt32LE(0, 38); // external file attributes
        cdEntry.writeUInt32LE(offset, 42); // relative offset of local header
        nameBytes.copy(cdEntry, 46);

        centralDir.push(cdEntry);
        offset += 30 + nameBytes.length + compressed.length;

        processNext(idx + 1);
      };

      processNext(0);
    });
  }

  private collectFiles(
    baseDir: string,
    currentDir: string,
    results: Array<{ relPath: string; absPath: string }>
  ): void {
    const entries = fs.readdirSync(currentDir);
    for (const entry of entries) {
      const absPath = path.join(currentDir, entry);
      const stat = fs.statSync(absPath);
      if (stat.isDirectory()) {
        this.collectFiles(baseDir, absPath, results);
      } else {
        const relPath = path.relative(baseDir, absPath).replace(/\\/g, '/');
        results.push({ relPath, absPath });
      }
    }
  }
}
