/**
 * integrations/ado/reporters/report-archiver.ts
 *
 * Playwright reporter that automatically archives the HTML report after every run.
 * Registered once in playwright.config.ts -- applies to ALL projects and future suites.
 *
 * Output produced after each run:
 *   reports/
 *     Suite18181_2026-06-09/         <- full report folder (npx playwright show-report)
 *     Suite18181_2026-06-09.zip      <- ZIP archive (attach to ADO, email, share)
 *
 * Collision handling (two runs on the same day):
 *     Suite18181_2026-06-09_2/       <- second run
 *     Suite18181_2026-06-09_2.zip
 *     Suite18181_2026-06-09_3/       <- third run, etc.
 *
 * Archive label is derived from the active Playwright project name:
 *   pod3-suite-18181  ->  Suite18181
 *   pod3-suite-18180  ->  Suite18180
 *   pod3-rules        ->  pod3-rules
 *   smoke             ->  smoke
 *   (multiple)        ->  Suites-18181-18180   or  combined
 *
 * No manual steps -- just run the tests and the archive appears in reports/.
 *
 * How to add a new suite:
 *   1. Add the project to playwright.config.ts  (this reporter picks it up automatically)
 *   2. Run tests -- archive is created with the suite ID in the name
 */

import * as fs   from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type {
  Reporter,
  FullConfig,
  Suite,
  FullResult,
} from '@playwright/test/reporter';

// ─── Reporter ────────────────────────────────────────────────────────────────

class ReportArchiverReporter implements Reporter {
  private readonly projectRoot: string;
  private readonly reportsDir:  string;
  private archiveLabel = 'report';
  private startTime    = new Date();

  constructor() {
    // __dirname = integrations/ado/reporters/ -- go up 3 levels to project root
    this.projectRoot = path.resolve(__dirname, '../../../');
    this.reportsDir  = path.join(this.projectRoot, 'reports');
  }

  onBegin(_config: FullConfig, rootSuite: Suite): void {
    this.startTime = new Date();

    // ── Collect active project names from the root suite's direct children ──
    // Each child of the root suite is a project suite whose title is the project name.
    const projectNames: string[] = [];
    for (const s of rootSuite.suites) {
      const name = s.title.trim();
      if (name) projectNames.push(name);
    }

    this.archiveLabel = this._buildLabel(projectNames);

    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    console.log(
      `[report-archiver] Run started — archive will be saved as: ${this.archiveLabel}_<YYYY-MM-DD>[_<run>]`
    );
  }

  onEnd(_result: FullResult): void {
    const playwrightReport = path.join(this.projectRoot, 'playwright-report');

    if (!fs.existsSync(playwrightReport)) {
      console.warn('[report-archiver] playwright-report folder not found -- skipping archive');
      return;
    }

    // ── Build date-based name with collision counter ────────────────────────
    const t       = this.startTime;
    const dateStr = [
      t.getFullYear(),
      String(t.getMonth() + 1).padStart(2, '0'),
      String(t.getDate()).padStart(2, '0'),
    ].join('-');

    const baseName    = `${this.archiveLabel}_${dateStr}`;
    const archiveName = this._resolveUniqueName(baseName);
    const destDir     = path.join(this.reportsDir, archiveName);
    const zipPath     = path.join(this.reportsDir, `${archiveName}.zip`);

    // ── Step 1: Copy playwright-report -> reports/<name>/ ──────────────────
    try {
      this._copyDirSync(playwrightReport, destDir);
      console.log(`\n[report-archiver] Report folder saved  -> ${destDir}`);
    } catch (err) {
      console.warn(`[report-archiver] Failed to copy report folder: ${err}`);
      return;
    }

    // ── Step 2: Create ZIP ──────────────────────────────────────────────────
    try {
      if (process.platform === 'win32') {
        // Use PowerShell Compress-Archive (built-in on Windows 10+)
        execSync(
          `powershell -NoProfile -Command "` +
          `Compress-Archive -Path '${destDir}\\*' -DestinationPath '${zipPath}' -Force"`,
          { stdio: 'pipe' }
        );
      } else {
        // macOS / Linux fallback
        execSync(`zip -qr "${zipPath}" "${destDir}"`, { stdio: 'pipe' });
      }
      const sizeKb = Math.round(fs.statSync(zipPath).size / 1024);
      console.log(`[report-archiver] ZIP created           -> ${zipPath}  (${sizeKb} KB)`);
    } catch (err) {
      console.warn(`[report-archiver] ZIP creation failed: ${err}`);
    }

    // ── Step 3: List all saved ZIPs for this suite ──────────────────────────
    try {
      const label  = this.archiveLabel;
      const allZips = fs.readdirSync(this.reportsDir)
        .filter(f => f.startsWith(label + '_') && f.endsWith('.zip'))
        .sort()
        .reverse();

      if (allZips.length > 1) {
        console.log(`[report-archiver] All ${label} archives:`);
        for (const z of allZips) {
          const kb = Math.round(fs.statSync(path.join(this.reportsDir, z)).size / 1024);
          console.log(`  ${z}  (${kb} KB)`);
        }
      }
    } catch { /* non-fatal */ }

    console.log(
      `\n[report-archiver] Attach to ADO:  ${zipPath}` +
      `\n[report-archiver] View report:    npx playwright show-report "${destDir}" --port 9323\n`
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Builds a short archive label from the active Playwright project name(s).
   *
   *   ["pod3-suite-18181"]           -> "Suite18181"
   *   ["pod3-suite-18180"]           -> "Suite18180"
   *   ["pod3-rules"]                 -> "pod3-rules"
   *   ["pod3-suite-18181","pod3-suite-18180"]  -> "Suites-18181-18180"
   *   (4+ projects)                  -> "combined"
   */
  private _buildLabel(projectNames: string[]): string {
    if (projectNames.length === 0) return 'report';

    if (projectNames.length === 1) {
      const name = projectNames[0];
      // "pod3-suite-18181" or "suite-18181" -> "Suite18181"
      const suiteMatch = name.match(/suite-?(\d+)/i);
      if (suiteMatch) return `Suite${suiteMatch[1]}`;
      // Any other name: sanitize to alphanumeric + hyphens
      return name.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-');
    }

    // Multiple projects
    const ids = projectNames.map(n => {
      const m = n.match(/suite-?(\d+)/i);
      return m ? m[1] : n.replace(/[^a-zA-Z0-9]/g, '');
    });

    return ids.length <= 3
      ? `Suites-${ids.join('-')}`
      : 'combined';
  }

  /**
   * Returns a unique archive name for the given base (e.g. "Suite18181_2026-06-09").
   *
   * If neither the folder nor the zip already exists, returns `base` unchanged.
   * Otherwise appends _2, _3, … until a free slot is found.
   *
   *   Suite18181_2026-06-09        <- first run (no suffix)
   *   Suite18181_2026-06-09_2      <- second run same day
   *   Suite18181_2026-06-09_3      <- third run, etc.
   */
  private _resolveUniqueName(base: string): string {
    const taken = (name: string): boolean =>
      fs.existsSync(path.join(this.reportsDir, name)) ||
      fs.existsSync(path.join(this.reportsDir, `${name}.zip`));

    if (!taken(base)) return base;

    let counter = 2;
    while (taken(`${base}_${counter}`)) counter++;
    return `${base}_${counter}`;
  }

  /**
   * Recursively copies src directory to dest (creates dest if absent).
   */
  private _copyDirSync(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath  = path.join(src,  entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this._copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

export default ReportArchiverReporter;
