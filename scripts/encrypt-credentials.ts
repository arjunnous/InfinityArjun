#!/usr/bin/env ts-node
// File: scripts/encrypt-credentials.ts
//
// CLI utility to encrypt plaintext passwords for storage in .env.
//
// Usage:
//   npm run encrypt:creds                    # interactive: prompts for each password
//   npm run encrypt:creds -- --generate-key  # print a new random ENCRYPTION_KEY
//   npm run encrypt:creds -- --value "mypassword"  # encrypt a single value

import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { encrypt, generateKey, isEncrypted } from '@utils/crypto-utils';

dotenv.config();

const args = process.argv.slice(2);

// ── --generate-key ─────────────────────────────────────────────────────────
if (args.includes('--generate-key')) {
  const key = generateKey();
  console.log('\nGenerated ENCRYPTION_KEY (add to .env):');
  console.log(`ENCRYPTION_KEY=${key}\n`);
  process.exit(0);
}

// ── --value <plaintext> ────────────────────────────────────────────────────
const valueIdx = args.indexOf('--value');
if (valueIdx !== -1) {
  const plaintext = args[valueIdx + 1];
  if (!plaintext) {
    console.error('Error: --value requires an argument.');
    process.exit(1);
  }
  if (isEncrypted(plaintext)) {
    console.log('Value is already encrypted:', plaintext);
    process.exit(0);
  }
  console.log('\nEncrypted value:');
  console.log(encrypt(plaintext));
  console.log('');
  process.exit(0);
}

// ── Interactive mode — encrypt all credential env vars ────────────────────
const CREDENTIAL_KEYS = [
  'ADMIN_PASSWORD',
  'UNDERWRITER_PASSWORD',
  'AGENT_PASSWORD',
  'DB_PASSWORD',
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main(): Promise<void> {
  console.log('\n=== Insurity Automation — Credential Encryptor ===\n');
  console.log('Enter plaintext passwords. Press Enter to skip (keep existing value).\n');

  const results: Array<{ key: string; encrypted: string }> = [];

  for (const key of CREDENTIAL_KEYS) {
    const current = process.env[key] ?? '';
    const currentDisplay = isEncrypted(current)
      ? '(already encrypted)'
      : current
      ? '(set, plaintext)'
      : '(not set)';

    const input = await ask(`${key} ${currentDisplay}: `);
    const plaintext = input.trim();

    if (!plaintext) {
      console.log(`  → Skipping ${key}\n`);
      continue;
    }

    const encrypted = encrypt(plaintext);
    results.push({ key, encrypted });
    console.log(`  → ${key}=${encrypted}\n`);
  }

  rl.close();

  if (results.length === 0) {
    console.log('No values encrypted.\n');
    return;
  }

  console.log('\n=== Add these lines to your .env file ===\n');
  for (const { key, encrypted } of results) {
    console.log(`${key}=${encrypted}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('Encryption failed:', err.message);
  process.exit(1);
});
