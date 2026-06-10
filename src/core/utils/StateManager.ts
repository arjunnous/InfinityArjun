/**
 * utils/StateManager.ts
 *
 * Lightweight key/value store backed by a JSON file on disk.
 *
 * Playwright runs each spec file in a separate worker process.
 * process.env mutations in one worker are NOT visible in other workers.
 * A shared file on disk IS visible to all workers — so beforeAll state
 * (e.g. rate-plan versionId created once for a suite) can be read
 * by every individual test worker.
 *
 * Usage:
 *   const state = new StateManager('suite18306');
 *   state.set('versionId', 'abc-123');     // write
 *   const id = state.get('versionId');     // read
 *   state.clear();                         // optional cleanup
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';

export class StateManager {
  private readonly filePath: string;
  private cache: Record<string, string> = {};

  constructor(suiteName: string, dir?: string) {
    const folder   = dir ?? os.tmpdir();
    this.filePath  = path.join(folder, `${suiteName}-state.json`);
    this.cache     = this.load();
  }

  /** Get a value. Returns empty string if key is not found. */
  get(key: string): string {
    this.cache = this.load();   // re-read so worker always has latest value
    return this.cache[key] ?? '';
  }

  /** Set a value and immediately persist to disk. */
  set(key: string, value: string): void {
    this.cache[key] = value;
    this.persist();
  }

  /** Set multiple values at once. */
  setAll(values: Record<string, string>): void {
    Object.assign(this.cache, values);
    this.persist();
  }

  /** Remove all stored keys. */
  clear(): void {
    this.cache = {};
    try { fs.unlinkSync(this.filePath); } catch { /* file may not exist */ }
  }

  private load(): Record<string, string> {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private persist(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch { /* non-fatal */ }
  }
}
