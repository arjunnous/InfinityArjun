/**
 * Opens the ADO requirement-based test suite in a headful browser using the
 * user's existing Chrome profile (already logged in to ADO).
 * This triggers ADO's server-side population of the suite from TestedBy links.
 *
 * Usage:
 *   npx ts-node integrations/ado/scripts/populate-req-suite.ts <suiteId>
 *   npx ts-node integrations/ado/scripts/populate-req-suite.ts 20691
 */

import { chromium } from '@playwright/test';
import * as https from 'https';
import { loadEnv, requireEnv } from '../../../src/core/config/env';

// Load .env (and .env.<TEST_ENV> overlay) from project root
loadEnv();

const PLAN_ID  = process.argv[3] ?? process.env['ADO_PLAN_ID'] ?? '18163';
const SUITE_ID = process.argv[2] ?? '20691';
const ORG      = 'InsurityDevOps';
const PROJECT  = 'Insurity%20EAIS%20AIDLC';
const PAT      = requireEnv('ADO_PAT');

const SUITE_URL = `https://dev.azure.com/${ORG}/${PROJECT}/_testPlans/execute?planId=${PLAN_ID}&suiteId=${SUITE_ID}`;
const CHROME_PROFILE = `C:\\Users\\lilip\\AppData\\Local\\Google\\Chrome\\User Data`;

function apiGet(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`:${PAT}`).toString('base64')}`,
        Accept:        'application/json',
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log(`\n[populate-req-suite] Opening Suite ${SUITE_ID} in Plan ${PLAN_ID}`);
  console.log(`  URL: ${SUITE_URL}`);
  console.log(`  Chrome profile: ${CHROME_PROFILE}`);

  // Check count BEFORE
  const before = await apiGet(`https://dev.azure.com/${ORG}/${PROJECT}/_apis/testplan/Plans/${PLAN_ID}/Suites/${SUITE_ID}/TestCase?api-version=7.0`) as { count?: number };
  console.log(`  TC count BEFORE: ${before.count ?? 0}`);

  // Open Chrome with the user's existing profile (already logged into ADO)
  const browser = await chromium.launchPersistentContext(CHROME_PROFILE, {
    channel:  'chrome',
    headless: false,
    args:     ['--disable-extensions-except=', '--profile-directory=Default'],
  });

  const page = browser.pages()[0] ?? await browser.newPage();

  console.log(`  Navigating to ADO suite...`);
  await page.goto(SUITE_URL, { waitUntil: 'networkidle', timeout: 60000 });

  // Wait for the test case grid to render (look for row count or spinner to disappear)
  try {
    await page.waitForSelector('.test-plan-hub-content', { timeout: 30000 });
  } catch {
    // Selector may vary — just wait a fixed delay for the page to fully load
    await page.waitForTimeout(10000);
  }

  console.log(`  Page loaded. Waiting 5s for suite population...`);
  await page.waitForTimeout(5000);

  await browser.close();

  // Check count AFTER
  const after = await apiGet(`https://dev.azure.com/${ORG}/${PROJECT}/_apis/testplan/Plans/${PLAN_ID}/Suites/${SUITE_ID}/TestCase?api-version=7.0`) as { count?: number };
  const count = after.count ?? 0;
  console.log(`  TC count AFTER: ${count}`);

  if (count > 0) {
    console.log(`\n  Suite ${SUITE_ID} now has ${count} test cases!`);
    console.log(`  Next: run "npm run push:report" to create a run from this suite with outcomes.`);
  } else {
    console.log(`\n  Still 0 — may need a manual browser visit or re-login first.`);
    console.log(`  Open this URL in your browser and wait for the test list to load:`);
    console.log(`  ${SUITE_URL}`);
  }
}

main().catch(err => {
  console.error('[populate-req-suite] Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
