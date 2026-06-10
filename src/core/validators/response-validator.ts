/**
 * validators/response-validator.ts
 *
 * Generic, reusable API response validation helpers for Playwright API tests.
 *
 * Design goals:
 *   - Works with any response shape (flat array, JSON:API enveloped, paginated)
 *   - Keeps test code readable by separating "how to assert" from "what to assert"
 *   - Every assertion produces a clear failure message without extra boilerplate
 *
 * Quick-start:
 *   import { validateResponse } from '@validators/response-validator';
 *
 *   const v = await validateResponse(res);         // deserialize + extract array
 *   v.assertFieldPresent('status', 'Active');      // positive check
 *   v.assertFieldAbsent('status', 'Draft');        // negative check
 *
 * Standalone helpers (useful when you already have the body):
 *   import { extractArray, assertFieldPresent } from '@validators/response-validator';
 *
 *   const items = extractArray(body);
 *   assertFieldPresent(items, 'environment', 'Production');
 */

import { expect } from '@playwright/test';
import type { APIResponse } from '@playwright/test';

// ─── Shared types ─────────────────────────────────────────────────────────────

/** Plain JS object with string keys. All item arrays use this shape internally. */
export type AnyRecord = Record<string, unknown>;

/** A function that tests one item and returns true when it matches. */
export type Predicate<T> = (item: T) => boolean;

// ─── Step 1 — Response deserialization ───────────────────────────────────────

/**
 * Deserializes a Playwright APIResponse body to a typed JS value.
 *
 * Why a wrapper instead of calling response.json() directly?
 *   - Centralises the cast to the caller-supplied type T, removing repetitive
 *     `as SomeType` casts scattered across test files.
 *   - Makes the deserialization step explicit and greppable in test code.
 *
 * @param response  The raw Playwright APIResponse object returned by request.*()
 * @returns         The parsed JSON body, typed as T (defaults to `unknown`)
 *
 * @example
 *   const body = await deserializeResponse<{ data: unknown[] }>(res);
 */
export async function deserializeResponse<T = unknown>(response: APIResponse): Promise<T> {
  // response.json() reads the body stream once and parses it as JSON.
  // Playwright caches the body so multiple calls to json() on the same response
  // return the same parsed object without re-reading the stream.
  return (await response.json()) as T;
}

// ─── Step 2 — Dynamic array extraction ───────────────────────────────────────

/**
 * Walks a dot-separated key path into `root` and returns the nested value.
 *
 * @example
 *   walkPath({ a: { b: [1, 2] } }, 'a.b')  // → [1, 2]
 *   walkPath({ x: 3 }, 'missing')           // → undefined
 */
function walkPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    // Guard against null / non-object nodes in the middle of the path
    if (node !== null && typeof node === 'object' && key in (node as object)) {
      return (node as AnyRecord)[key];
    }
    return undefined;
  }, root);
}

/**
 * Flattens a single JSON:API resource object into a plain record.
 *
 * JSON:API objects look like: { type, id, attributes: { field1, field2, … } }
 * After flattening:           { id, field1, field2, … }
 *
 * If the item is not a JSON:API resource object it is returned unchanged.
 */
function flattenJsonApiItem(item: AnyRecord): AnyRecord {
  if (item['attributes'] && typeof item['attributes'] === 'object') {
    return {
      id: item['id'],
      ...(item['attributes'] as AnyRecord),
    };
  }
  return item;
}

/**
 * Extracts an array of records from a parsed API response body.
 *
 * Tries the following locations in order (stops at the first array found):
 *   1. `path` — explicit dot-notation key path when provided (e.g. 'results' or 'meta.items')
 *   2. `data`           — JSON:API list response: { data: [...] }
 *   3. `items`          — common REST paginated envelope: { items: [...] }
 *   4. `data.items`     — nested variant: { data: { items: [...] } }
 *   5. The body itself  — if the root is already a plain array
 *
 * After locating the array, each element whose shape matches a JSON:API resource
 * object ({ type, id, attributes }) is automatically flattened so callers can
 * access `item['status']` instead of `item['attributes']['status']`.
 *
 * @param body   Parsed response body (result of deserializeResponse / response.json())
 * @param path   Optional explicit dot-path to the array within `body`
 * @returns      Flat array of plain objects; empty array if nothing is found
 *
 * @example
 *   // Standard JSON:API list: { data: [{ type, id, attributes }] }
 *   const items = extractArray(body);
 *
 *   // Custom path: { meta: { rules: [...] } }
 *   const items = extractArray(body, 'meta.rules');
 */
export function extractArray(body: unknown, path?: string): AnyRecord[] {
  let raw: unknown;

  if (path) {
    // Caller supplied an explicit path — trust it and go straight there
    raw = walkPath(body, path);
  } else {
    // Auto-detect: try each candidate location in priority order
    const b = body as AnyRecord;

    if (Array.isArray(b)) {
      raw = b;                                           // root is already an array
    } else if (Array.isArray(b['data'])) {
      raw = b['data'];                                   // { data: [...] }
    } else if (Array.isArray(b['items'])) {
      raw = b['items'];                                  // { items: [...] }
    } else if (b['data'] && typeof b['data'] === 'object') {
      const nested = b['data'] as AnyRecord;
      if (Array.isArray(nested['items'])) raw = nested['items']; // { data: { items: [...] } }
    }
  }

  if (!Array.isArray(raw)) return [];

  // Flatten JSON:API resource objects so field access is uniform
  return (raw as AnyRecord[]).map(flattenJsonApiItem);
}

// ─── Convenience traversal helpers ───────────────────────────────────────────

/**
 * Returns every item whose `field` strictly equals `value`.
 *
 * Non-asserting — use directly when you need the matching subset,
 * or pass it to your own expect() call.
 *
 * @example
 *   const activeRules = filterByField(items, 'status', 'Active');
 *   expect(activeRules.length).toBeGreaterThan(0);
 */
export function filterByField<T extends AnyRecord>(
  items: T[],
  field: string,
  value: unknown,
): T[] {
  return items.filter(item => item[field] === value);
}

/**
 * Returns the first item whose `field` strictly equals `value`, or undefined.
 *
 * Non-asserting — useful for extracting a specific record to inspect further.
 *
 * @example
 *   const target = findByField(deployments, 'environment', 'Production');
 *   expect(target?.['deployed_by']).toBeTruthy();
 */
export function findByField<T extends AnyRecord>(
  items: T[],
  field: string,
  value: unknown,
): T | undefined {
  return items.find(item => item[field] === value);
}

// ─── Step 3 — Assertion helpers ───────────────────────────────────────────────
//
// Two flavours:
//   a) Generic (predicate-based): assertPresent / assertAbsent
//      — any condition you can express as a function
//
//   b) Shorthand (field + value): assertFieldPresent / assertFieldAbsent
//      — single field equality check, most common case

/**
 * Asserts that AT LEAST ONE item in `items` satisfies `predicate`.
 * Fails with a descriptive message if none match.
 *
 * Use this for POSITIVE scenarios — "something matching X must exist".
 *
 * Implementation: Array.prototype.some() short-circuits on the first match,
 * so it is efficient even for large arrays.
 *
 * @param items     Array extracted from the API response
 * @param predicate Function returning true for a matching item
 * @param label     Human-readable condition description for failure messages
 *
 * @example
 *   assertPresent(rules, r => r['group'] === 'Underwriting' && r['status'] === 'Active',
 *     'Active Underwriting rule');
 */
export function assertPresent<T extends AnyRecord>(
  items: T[],
  predicate: Predicate<T>,
  label: string,
): void {
  // some() returns true as soon as one element satisfies the predicate
  const found = items.some(predicate);
  expect(
    found,
    `[assertPresent] Expected to find at least one item matching: ${label}` +
    ` (searched ${items.length} item(s))`,
  ).toBe(true);
}

/**
 * Asserts that NO item in `items` satisfies `predicate`.
 * Fails with a descriptive message if any match.
 *
 * Use this for NEGATIVE scenarios — "nothing matching X should exist".
 *
 * @param items     Array extracted from the API response
 * @param predicate Function returning true for a matching item
 * @param label     Human-readable condition description for failure messages
 *
 * @example
 *   assertAbsent(rules, r => r['status'] === 'Retired',
 *     'Retired rule should not appear in active listing');
 */
export function assertAbsent<T extends AnyRecord>(
  items: T[],
  predicate: Predicate<T>,
  label: string,
): void {
  // some() must return false — every element must fail the predicate
  const found = items.some(predicate);
  expect(
    found,
    `[assertAbsent] Expected NO item matching: ${label}` +
    ` (searched ${items.length} item(s))`,
  ).toBe(false);
}

/**
 * Shorthand positive assertion: field === value for AT LEAST ONE item.
 *
 * Equivalent to: assertPresent(items, item => item[field] === value, ...)
 *
 * @example
 *   assertFieldPresent(rules, 'status', 'Active');
 *   assertFieldPresent(deployments, 'environment', 'Production');
 */
export function assertFieldPresent<T extends AnyRecord>(
  items: T[],
  field: string,
  value: unknown,
): void {
  assertPresent(
    items,
    item => item[field] === value,
    `${field} = ${JSON.stringify(value)}`,
  );
}

/**
 * Shorthand negative assertion: field === value for NO item.
 *
 * Equivalent to: assertAbsent(items, item => item[field] === value, ...)
 *
 * @example
 *   assertFieldAbsent(rules, 'status', 'Retired');
 *   assertFieldAbsent(deployments, 'environment', 'QA');     // invalid env
 */
export function assertFieldAbsent<T extends AnyRecord>(
  items: T[],
  field: string,
  value: unknown,
): void {
  assertAbsent(
    items,
    item => item[field] === value,
    `${field} = ${JSON.stringify(value)}`,
  );
}

/**
 * Asserts the EXACT count of items that satisfy a predicate.
 *
 * Useful when the API is expected to return a specific number of matching records
 * (e.g., one entry per deployment environment, or exactly one active version).
 *
 * @param items          Array extracted from the API response
 * @param predicate      Matching condition
 * @param expectedCount  Number of items that must match
 * @param label          Human-readable condition description for failure messages
 *
 * @example
 *   // Rule_A was deployed to exactly 4 environments
 *   assertMatchCount(deployments, d => d['rule_id'] === ruleId, 4, 'Rule_A deployments');
 */
export function assertMatchCount<T extends AnyRecord>(
  items: T[],
  predicate: Predicate<T>,
  expectedCount: number,
  label: string,
): void {
  // filter() collects ALL matches; we then check the resulting array's length
  const matches = items.filter(predicate);
  expect(
    matches.length,
    `[assertMatchCount] Expected ${expectedCount} item(s) matching: ${label}` +
    ` — got ${matches.length}`,
  ).toBe(expectedCount);
}

// ─── Composite: all-in-one fluent entry point ─────────────────────────────────

/**
 * Deserializes `response`, extracts the item array, and returns a bound
 * ResponseValidator for fluent assertions.
 *
 * This is the recommended entry point when all three steps (deserialize →
 * extract → assert) happen inside the same test block.
 *
 * @param response   Playwright APIResponse
 * @param arrayPath  Optional dot-path to the array inside the body.
 *                   If omitted, extractArray() auto-detects the location.
 * @returns          A ResponseValidator wrapping the extracted items
 *
 * @example
 *   const v = await validateResponse(res);
 *   v.assertMinLength(1)
 *    .assertFieldPresent('status', 'Active')
 *    .assertFieldAbsent('status', 'Retired');
 */
export async function validateResponse(
  response: APIResponse,
  arrayPath?: string,
): Promise<ResponseValidator> {
  // Step 1: Deserialize — read and parse the response body as JSON
  const body = await deserializeResponse(response);

  // Step 2: Extract — locate and flatten the array within the parsed body
  const items = extractArray(body, arrayPath);

  // Step 3: Return a validator bound to those items
  return new ResponseValidator(items);
}

// ─── ResponseValidator class ──────────────────────────────────────────────────

/**
 * Fluent assertion wrapper around an array of response items.
 *
 * All assertion methods return `this`, enabling a chained style:
 *   validator.assertMinLength(1).assertFieldPresent('status', 'Active');
 *
 * Use `all()`, `filter()`, or `find()` to retrieve items for custom assertions
 * not covered by the built-in methods.
 */
export class ResponseValidator<T extends AnyRecord = AnyRecord> {
  constructor(private readonly items: T[]) {}

  // ── Accessors ───────────────────────────────────────────────────────────────

  /** Number of items in the extracted array. */
  get length(): number {
    return this.items.length;
  }

  /**
   * Returns the full extracted array.
   * Use when you need raw access for custom expect() calls.
   *
   * @example
   *   const rules = v.all();
   *   expect(rules[0]['rule_code']).toMatch(/^[A-Z_]+$/);
   */
  all(): T[] {
    return this.items;
  }

  /**
   * Returns items satisfying `predicate` — delegates to Array.prototype.filter().
   * Non-asserting; use for ad-hoc filtering before further inspection.
   *
   * @example
   *   const drafts = v.filter(r => r['status'] === 'Draft');
   */
  filter(predicate: Predicate<T>): T[] {
    return this.items.filter(predicate);
  }

  /**
   * Returns the first item satisfying `predicate`, or undefined.
   * Non-asserting; delegates to Array.prototype.find().
   *
   * @example
   *   const prod = v.find(d => d['environment'] === 'Production');
   *   expect(prod?.['deployed_by']).toBeTruthy();
   */
  find(predicate: Predicate<T>): T | undefined {
    return this.items.find(predicate);
  }

  // ── Length assertions ────────────────────────────────────────────────────────

  /**
   * Asserts the array contains at least `min` items.
   *
   * @example
   *   v.assertMinLength(1);  // at least one item returned
   */
  assertMinLength(min: number): this {
    expect(
      this.items.length,
      `[assertMinLength] Expected ≥ ${min} item(s), received ${this.items.length}`,
    ).toBeGreaterThanOrEqual(min);
    return this;
  }

  /**
   * Asserts the array contains exactly `expected` items.
   *
   * @example
   *   v.assertLength(4);  // exactly 4 deployments
   */
  assertLength(expected: number): this {
    expect(
      this.items.length,
      `[assertLength] Expected exactly ${expected} item(s), received ${this.items.length}`,
    ).toBe(expected);
    return this;
  }

  // ── Predicate-based assertions ────────────────────────────────────────────

  /**
   * Positive assertion — at least one item satisfies `predicate`.
   *
   * @example
   *   v.assertPresent(r => r['scope'] === 'Policy' && r['status'] === 'Active',
   *     'Active Policy-scope rule');
   */
  assertPresent(predicate: Predicate<T>, label: string): this {
    assertPresent(this.items, predicate, label);
    return this;
  }

  /**
   * Negative assertion — no item satisfies `predicate`.
   *
   * @example
   *   v.assertAbsent(r => r['status'] === 'Retired', 'Retired rule in active list');
   */
  assertAbsent(predicate: Predicate<T>, label: string): this {
    assertAbsent(this.items, predicate, label);
    return this;
  }

  // ── Field-based shorthand assertions ─────────────────────────────────────

  /**
   * Positive shorthand — at least one item has `field === value`.
   *
   * @example
   *   v.assertFieldPresent('status', 'Active');
   *   v.assertFieldPresent('context', 'Quote');
   */
  assertFieldPresent(field: string, value: unknown): this {
    assertFieldPresent(this.items, field, value);
    return this;
  }

  /**
   * Negative shorthand — no item has `field === value`.
   *
   * @example
   *   v.assertFieldAbsent('status', 'Draft');
   *   v.assertFieldAbsent('environment', 'QA');
   */
  assertFieldAbsent(field: string, value: unknown): this {
    assertFieldAbsent(this.items, field, value);
    return this;
  }

  /**
   * Exact-count assertion — precisely `expectedCount` items satisfy `predicate`.
   *
   * @example
   *   v.assertMatchCount(d => d['environment'] === 'Staging', 1, 'Staging deployments');
   */
  assertMatchCount(
    predicate: Predicate<T>,
    expectedCount: number,
    label: string,
  ): this {
    assertMatchCount(this.items, predicate, expectedCount, label);
    return this;
  }
}
