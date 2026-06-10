// File: utils/crypto-utils.ts

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'ENC:';
const KEY_BYTES = 32; // 256-bit key
const IV_BYTES = 12;  // 96-bit IV — recommended for GCM

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('[crypto-utils] ENCRYPTION_KEY is not set in environment.');
  }
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `[crypto-utils] ENCRYPTION_KEY must be ${KEY_BYTES * 2} hex characters (${KEY_BYTES} bytes). Got ${buf.length * 2}.`,
    );
  }
  return buf;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a self-contained string: ENC:<iv_hex>:<authTag_hex>:<ciphertext_base64>
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a value produced by encrypt().
 * Throws if the value is tampered or the key is wrong.
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext.startsWith(ENC_PREFIX)) {
    throw new Error('[crypto-utils] Value does not start with ENC: — not an encrypted string.');
  }
  const parts = ciphertext.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('[crypto-utils] Malformed encrypted value. Expected ENC:<iv>:<authTag>:<data>.');
  }
  const [ivHex, authTagHex, dataB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Returns true if value was produced by encrypt(). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

/**
 * Auto-decrypt if encrypted, return as-is if plain.
 * Use this everywhere a password env var is consumed.
 */
export function resolveSecret(value: string): string {
  return isEncrypted(value) ? decrypt(value) : value;
}

/**
 * Generate a new random 256-bit key formatted as a 64-char hex string.
 * Run once to bootstrap ENCRYPTION_KEY in your .env.
 */
export function generateKey(): string {
  return crypto.randomBytes(KEY_BYTES).toString('hex');
}
