import crypto from 'node:crypto';
import { config } from '../config';
import { logger } from './logger';

/**
 * AES-256-GCM encrypt/decrypt for FASHN.ai API keys at rest.
 *
 * Key: 32 bytes derived from the ENCRYPTION_KEY env var (64-char hex string).
 *
 * Storage format (string): `${ivHex}:${tagHex}:${ciphertextHex}`
 *
 * All encryption is symmetric + authenticated (GCM tag), so tampering is
 * detected on decrypt.
 */

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV is recommended for GCM

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  _key = Buffer.from(config.encryption.key, 'hex');
  if (_key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes (got ${_key.length})`,
    );
  }
  return _key;
}

export interface CryptoAdapter {
  encrypt(plaintext: string): string;
  decrypt(payload: string): string;
}

class AesGcmCryptoAdapter implements CryptoAdapter {
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }
    const [ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  }
}

export const cryptoAdapter: CryptoAdapter = new AesGcmCryptoAdapter();

/** Convenience helpers */
export function encryptApiKey(plaintext: string): string {
  return cryptoAdapter.encrypt(plaintext);
}

export function decryptApiKey(payload: string): string {
  try {
    return cryptoAdapter.decrypt(payload);
  } catch (err) {
    logger
      .child({ lib: 'crypto' })
      .error({ err: (err as Error).message }, 'decrypt failed');
    throw err;
  }
}

/**
 * Generate a new FASHN-style API key (used by seed script / tests; production
 * keys come from FASHN.ai directly).
 */
export function generateApiKey(prefix = 'fk_live_'): string {
  const rand = crypto.randomBytes(24).toString('hex');
  return `${prefix}${rand}`;
}

/** Returns the first 8 + last 4 chars for display, e.g. `fk_live_ab…wxyz`. */
export function keyHint(plaintext: string): string {
  if (plaintext.length <= 12) return plaintext;
  return `${plaintext.slice(0, 8)}…${plaintext.slice(-4)}`;
}

/** Returns the first 12 chars as a prefix used for matching. */
export function keyPrefix(plaintext: string): string {
  return plaintext.slice(0, 12);
}
