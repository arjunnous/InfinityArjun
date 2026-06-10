// File: src/core/config/env.ts
//
// Single env loader for the whole framework. Loads the shared `.env` first,
// then overlays `.env.<TEST_ENV>` (qa | staging | ...). Existing readers in
// playwright.config.ts / global-setup.ts / scripts can delegate here instead
// of each re-implementing the same dotenv overlay.

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  dotenv.config();

  const testEnv = process.env.TEST_ENV ?? 'qa';
  const envFile = path.resolve(process.cwd(), `.env.${testEnv}`);
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
  }
  // No warning when the overlay file is absent — project.config.ts is the
  // source of truth for all non-secret config values.
}

/** Active environment label, e.g. "QA" or "STAGING". */
export function activeEnv(): string {
  loadEnv();
  return process.env.ENV ?? (process.env.TEST_ENV ?? 'qa').toUpperCase();
}

export function getEnv(name: string): string | undefined {
  loadEnv();
  return process.env[name];
}

export function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
