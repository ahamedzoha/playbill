import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'playbill-setup-'));
process.env.CONFIG_DIR = dir;

const { upsertAdmin } = await import('./auth');
const { openTestDb } = await import('./db/migrate');
const { checkSetupCode, ensureSetupCode } = await import('./setup');

describe('setup code', () => {
  it('is stable until an owner exists, accepts loose input, then disappears', () => {
    const { db } = openTestDb();
    const code = ensureSetupCode(db)!;
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(ensureSetupCode(db)).toBe(code);
    expect(existsSync(join(dir, 'setup-code.txt'))).toBe(true);

    expect(checkSetupCode(db, code.toLowerCase().replace('-', ' '))).toBe(true);
    expect(checkSetupCode(db, 'AAAA-BBBB')).toBe(false);

    upsertAdmin(db, { plexUserId: '1', username: 'o', email: null, thumb: null, role: 'owner' });
    expect(ensureSetupCode(db)).toBeNull();
    expect(existsSync(join(dir, 'setup-code.txt'))).toBe(false);
    expect(checkSetupCode(db, code)).toBe(false);
  });
});
