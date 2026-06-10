// File: utils/string-utils.ts

// ---------------------------------------------------------------------------
// Pure string utilities — zero external dependencies
// ---------------------------------------------------------------------------

const ALPHANUMERIC_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a cryptographically-random alphanumeric string of the given length.
 * Uses `crypto.getRandomValues` when available (browser / Node 15+), otherwise
 * falls back to `Math.random`.
 *
 * @param length - Number of characters to generate (must be > 0).
 *
 * @example
 *   randomAlphanumeric(8);  // 'aB3kPz9Q'
 *   randomAlphanumeric(12); // 'X7mNqR2oLpVs'
 */
export function randomAlphanumeric(length: number): string {
  if (length <= 0) {
    throw new RangeError('[randomAlphanumeric] length must be greater than 0.');
  }

  let result = '';

  // Use crypto when available for better entropy
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      result += ALPHANUMERIC_CHARS[bytes[i] % ALPHANUMERIC_CHARS.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += ALPHANUMERIC_CHARS[Math.floor(Math.random() * ALPHANUMERIC_CHARS.length)];
    }
  }

  return result;
}

/**
 * Generate a policy number in the format `POL-YYYY-NNNNNN` where:
 *   YYYY   = current calendar year
 *   NNNNNN = 6-digit zero-padded random integer (000001 – 999999)
 *
 * @example
 *   randomPolicyNumber(); // 'POL-2024-042718'
 */
export function randomPolicyNumber(): string {
  const year = new Date().getFullYear();

  // Generate a 6-digit numeric sequence using crypto when available
  let seq: number;

  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    // 3 bytes → up to 16777215; clamp to 1-999999
    const buf = new Uint8Array(3);
    globalThis.crypto.getRandomValues(buf);
    const raw = (buf[0] << 16) | (buf[1] << 8) | buf[2];
    seq = (raw % 999_999) + 1;
  } else {
    seq = Math.floor(Math.random() * 999_999) + 1;
  }

  const seqStr = String(seq).padStart(6, '0');
  return `POL-${year}-${seqStr}`;
}

/**
 * Left-pad `str` with `char` (default `' '`) until it reaches `length`.
 * If `str` is already at or longer than `length`, it is returned unchanged.
 *
 * @param str    - The string to pad.
 * @param length - The desired minimum total length.
 * @param char   - The character used for padding (defaults to `' '`).
 *                 Only the first character of `char` is used.
 *
 * @example
 *   padLeft('42', 6, '0'); // '000042'
 *   padLeft('hi', 5);      // '   hi'
 *   padLeft('toolong', 3); // 'toolong'  (unchanged)
 */
export function padLeft(str: string, length: number, char = ' '): string {
  if (char.length === 0) {
    throw new RangeError('[padLeft] char must be a non-empty string.');
  }

  const padChar = char[0];

  if (str.length >= length) {
    return str;
  }

  return padChar.repeat(length - str.length) + str;
}
