import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config';
import { safeEqual } from './ids';

/**
 * One master secret drives two derived keys:
 * - AES-256-GCM for API keys and tokens stored in the database
 * - HMAC-SHA256 for signed links (unsubscribe tokens, image URLs)
 *
 * The secret comes from PLAYBILL_SECRET_KEY or is generated once into the config volume.
 * Losing it makes stored API keys unreadable and invalidates links in emails already sent.
 */
export class Crypto {
  private readonly encKey: Buffer;
  private readonly macKey: Buffer;

  constructor(secret: string) {
    this.encKey = createHash('sha256').update(`enc:${secret}`).digest();
    this.macKey = createHash('sha256').update(`mac:${secret}`).digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${data.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    const [version, iv, tag, data] = payload.split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unrecognised ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  /** Short, URL-safe signature of `value` within a `purpose` namespace. */
  sign(purpose: string, value: string, length = 22): string {
    return createHmac('sha256', this.macKey).update(`${purpose}\n${value}`).digest('base64url').slice(0, length);
  }

  verify(purpose: string, value: string, signature: string): boolean {
    return safeEqual(this.sign(purpose, value, signature.length), signature);
  }
}

export function loadSecret(configDir: string, override: string | null): string {
  if (override) return override;
  const file = join(configDir, 'secret.key');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(configDir, { recursive: true });
  const secret = randomBytes(32).toString('base64url');
  writeFileSync(file, secret, { mode: 0o600, flag: 'wx' });
  return secret;
}

let instance: Crypto | null = null;

export function crypto(): Crypto {
  if (!instance) {
    const c = config();
    instance = new Crypto(loadSecret(c.configDir, c.secretKey));
  }
  return instance;
}
