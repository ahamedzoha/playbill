import { and, eq, gt, lt } from 'drizzle-orm';
import type { Db } from './db';
import { admins, sessions } from './db/schema';
import { randomToken, sha256 } from './ids';

export const SESSION_COOKIE = 'playbill_session';
export const SESSION_TTL_MS = 30 * 24 * 3_600_000;
/** Only push expiry forward (a write) when a session is used after this much idle time. */
const SLIDE_AFTER_MS = 3_600_000;

export type Admin = typeof admins.$inferSelect;

export function createSession(db: Db, plexUserId: string, userAgent: string | null, now = Date.now()): string {
  const token = randomToken(32);
  db.insert(sessions)
    .values({
      id: sha256(token),
      plexUserId,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      lastSeenAt: now,
      userAgent: userAgent?.slice(0, 300) ?? null,
    })
    .run();
  return token;
}

/** The signed-in admin for a session cookie, or null. Extends the session while it is used. */
export function validateSession(db: Db, token: string | undefined | null, now = Date.now()): Admin | null {
  if (!token) return null;
  const id = sha256(token);
  const row = db
    .select({ session: sessions, admin: admins })
    .from(sessions)
    .innerJoin(admins, eq(admins.plexUserId, sessions.plexUserId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .get();
  if (!row) return null;
  if (now - row.session.lastSeenAt > SLIDE_AFTER_MS) {
    db.update(sessions)
      .set({ lastSeenAt: now, expiresAt: now + SESSION_TTL_MS })
      .where(eq(sessions.id, id))
      .run();
  }
  return row.admin;
}

export function destroySession(db: Db, token: string | undefined | null): void {
  if (token) db.delete(sessions).where(eq(sessions.id, sha256(token))).run();
}

export function pruneSessions(db: Db, now = Date.now()): number {
  return db.delete(sessions).where(lt(sessions.expiresAt, now)).run().changes;
}

export function hasOwner(db: Db): boolean {
  return !!db.select({ id: admins.plexUserId }).from(admins).where(eq(admins.role, 'owner')).get();
}

export function findAdmin(db: Db, plexUserId: string): Admin | null {
  return db.select().from(admins).where(eq(admins.plexUserId, plexUserId)).get() ?? null;
}

export function upsertAdmin(
  db: Db,
  a: { plexUserId: string; username: string; email: string | null; thumb: string | null; role: Admin['role'] },
  now = Date.now(),
): void {
  db.insert(admins)
    .values({ ...a, addedAt: now, lastLoginAt: now })
    .onConflictDoUpdate({
      target: admins.plexUserId,
      set: { username: a.username, email: a.email, thumb: a.thumb, lastLoginAt: now },
    })
    .run();
}
