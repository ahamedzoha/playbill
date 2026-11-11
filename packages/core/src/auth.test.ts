import { describe, expect, it } from 'vitest';
import { SESSION_TTL_MS, createSession, destroySession, hasOwner, upsertAdmin, validateSession } from './auth';
import { openTestDb } from './db/migrate';

describe('sessions', () => {
  function setup() {
    const { db } = openTestDb();
    upsertAdmin(db, { plexUserId: '42', username: 'owner', email: null, thumb: null, role: 'owner' }, 0);
    return db;
  }

  it('validates a fresh session and rejects unknown tokens', () => {
    const db = setup();
    const token = createSession(db, '42', 'test', 1_000);
    expect(validateSession(db, token, 2_000)?.username).toBe('owner');
    expect(validateSession(db, 'nope', 2_000)).toBeNull();
    expect(validateSession(db, undefined, 2_000)).toBeNull();
    expect(hasOwner(db)).toBe(true);
  });

  it('expires, slides while used, and can be destroyed', () => {
    const db = setup();
    const token = createSession(db, '42', null, 0);
    // Used after 2 hours idle: expiry slides forward.
    expect(validateSession(db, token, 2 * 3_600_000)).not.toBeNull();
    expect(validateSession(db, token, SESSION_TTL_MS + 3_600_000)).not.toBeNull();
    expect(validateSession(db, token, 3 * SESSION_TTL_MS)).toBeNull();
    const other = createSession(db, '42', null, 0);
    destroySession(db, other);
    expect(validateSession(db, other, 1)).toBeNull();
  });
});
