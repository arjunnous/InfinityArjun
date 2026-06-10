/**
 * utils/id-generator.ts
 *
 * Runtime unique ID generation utilities.
 *
 * Strategy: crypto.randomUUID() — Node.js built-in (v14.17+), no dependencies,
 * produces RFC 4122 v4 UUIDs (128-bit cryptographically random).
 *
 * Usage:
 *   import { generateUUID, generatePrefixedId } from '@utils/id-generator';
 *
 *   const id   = generateUUID();                  // "a3bb189e-8bf9-3888-9912-ace4e6543002"
 *   const rule = generatePrefixedId('RULE');      // "RULE-a3bb189e"
 *   const pol  = generatePrefixedId('POLICY');    // "POLICY-f7c21d4a"
 */

import { randomUUID } from 'crypto';

/**
 * Generates a RFC 4122 v4 UUID string.
 *
 * @returns Full UUID, e.g. "a3bb189e-8bf9-3888-9912-ace4e6543002"
 *
 * @example
 *   const id = generateUUID();
 *   // use as a unique identifier in test payloads
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Generates a short prefixed ID using the first 8 hex characters of a UUID.
 *
 * The UUID is generated fresh each call, giving ~4 billion unique values per prefix.
 * Sufficient for test data uniqueness within a single run or across runs.
 *
 * @param prefix  Uppercase string label, e.g. "RULE", "POLICY", "PRODUCT"
 * @returns       e.g. "RULE-a3bb189e", "POLICY-f7c21d4a"
 *
 * @example
 *   const ruleId    = generatePrefixedId('RULE');    // "RULE-a3bb189e"
 *   const policyId  = generatePrefixedId('POLICY');  // "POLICY-f7c21d4a"
 */
export function generatePrefixedId(prefix: string): string {
  const short = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${prefix}-${short}`;
}
