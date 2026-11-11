import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Crypto, loadSecret } from './crypto';

describe('Crypto', () => {
  const c = new Crypto('test-secret');

  it('round-trips encrypted values and rejects tampering', () => {
    const enc = c.encrypt('plex-token-123');
    expect(enc).not.toContain('plex-token-123');
    expect(c.decrypt(enc)).toBe('plex-token-123');
    const parts = enc.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => c.decrypt(parts.join('.'))).toThrow();
  });

  it('signs per purpose and verifies in constant time', () => {
    const sig = c.sign('unsub', 'rcp_1');
    expect(c.verify('unsub', 'rcp_1', sig)).toBe(true);
    expect(c.verify('unsub', 'rcp_2', sig)).toBe(false);
    expect(c.verify('img', 'rcp_1', sig)).toBe(false);
    expect(new Crypto('other').verify('unsub', 'rcp_1', sig)).toBe(false);
  });

  it('generates the secret once with owner-only permissions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'playbill-'));
    const first = loadSecret(dir, null);
    expect(loadSecret(dir, null)).toBe(first);
    expect(readFileSync(join(dir, 'secret.key'), 'utf8')).toBe(first);
    expect(statSync(join(dir, 'secret.key')).mode & 0o777).toBe(0o600);
    expect(loadSecret(dir, 'override')).toBe('override');
  });
});
