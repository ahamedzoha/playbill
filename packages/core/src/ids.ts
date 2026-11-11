import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** Random id with a type prefix, e.g. `run_7k2m9x4q1c8v3b6n`. */
export function newId(prefix: string): string {
  const bytes = randomBytes(16);
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 31];
  return `${prefix}_${out}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time string comparison for secrets and signatures. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
