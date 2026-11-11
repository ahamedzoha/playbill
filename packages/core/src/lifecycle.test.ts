import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

process.env.CONFIG_DIR = mkdtempSync(join(tmpdir(), 'playbill-life-'));

const { DEFAULT_RULES, decideRemoval, evaluateLifecycle, queueLifecycleEmails } = await import('./lifecycle');
const { openTestDb } = await import('./db/migrate');
const { deliveries, lifecycleActions, people } = await import('./db/schema');
const { setSetting } = await import('./settings');

const DAY = 86_400_000;
const now = 1_800_000_000_000;

function setup() {
  const { db } = openTestDb();
  setSetting(db, 'lifecycle', { ...DEFAULT_RULES, enabled: true });
  const base = { thumb: null, plexLastSeenAt: null, tautulliNotify: null, removedAt: null, syncedAt: 0, invitedAt: now - 900 * DAY, acceptedAt: now - 900 * DAY, firstSeenAt: 0 };
  const mk = (id: string, idleDays: number, extra: Record<string, unknown> = {}) => ({
    ...base,
    plexUserId: id,
    username: id,
    displayName: id,
    email: `${id}@x.com`,
    status: 'shared' as const,
    lastPlayedAt: now - idleDays * DAY,
    ...extra,
  });
  db.insert(people)
    .values([mk('fresh', 10), mk('nudge', 70), mk('warn', 170), mk('gone', 200), mk('exempt', 300, { exempt: true }), mk('home', 300, { status: 'home' }), mk('owner', 300, { status: 'owner' })])
    .run();
  return db;
}

const kinds = (db: ReturnType<typeof setup>) =>
  db.select().from(lifecycleActions).all().map((a) => `${a.plexUserId}:${a.kind}:${a.status}`).sort();

describe('evaluateLifecycle', () => {
  it('nudges at 60 days, warns at 165, and leaves exempt, home and owner alone', () => {
    const db = setup();
    const r = evaluateLifecycle(db, now);
    expect(r.nudges.map((a) => a.plexUserId)).toEqual(['nudge']);
    expect(r.warnings.map((a) => a.plexUserId).sort()).toEqual(['gone', 'warn']);
    expect(r.removals).toEqual([]);
    // Once per stretch: running again adds nothing.
    evaluateLifecycle(db, now + 1000);
    expect(kinds(db)).toEqual(['gone:warning:queued', 'nudge:nudge:queued', 'warn:warning:queued']);
  });

  it('proposes removal only after a sent warning has passed its deadline, and never removes by itself', () => {
    const db = setup();
    evaluateLifecycle(db, now);
    queueLifecycleEmails(db, now);
    expect(db.select().from(deliveries).all()).toHaveLength(3);
    // 15 days later: past the 14-day grace.
    const later = now + 15 * DAY;
    const r = evaluateLifecycle(db, later);
    expect(r.removals.map((a) => a.plexUserId).sort()).toEqual(['gone', 'warn']);
    expect(r.removals.every((a) => a.status === 'awaiting')).toBe(true);
  });

  it('watching again cancels a pending warning or removal', () => {
    const db = setup();
    evaluateLifecycle(db, now);
    queueLifecycleEmails(db, now);
    evaluateLifecycle(db, now + 15 * DAY);
    db.update(people).set({ lastPlayedAt: now + 16 * DAY }).where(eq(people.plexUserId, 'gone')).run();
    const r = evaluateLifecycle(db, now + 17 * DAY);
    expect(r.cancelled).toBeGreaterThanOrEqual(1);
    const gone = db.select().from(lifecycleActions).all().filter((a) => a.plexUserId === 'gone' && a.kind === 'removal');
    expect(gone.map((a) => a.status)).toEqual(['cancelled']);
  });

  it('keeping someone can also mark them exempt', () => {
    const db = setup();
    evaluateLifecycle(db, now);
    queueLifecycleEmails(db, now);
    const [removal] = evaluateLifecycle(db, now + 15 * DAY).removals;
    decideRemoval(db, { actionId: removal!.id, approve: false, exempt: true }, 'owner');
    expect(db.select().from(people).where(eq(people.plexUserId, removal!.plexUserId)).get()!.exempt).toBe(true);
  });

  it('does nothing when switched off', () => {
    const db = setup();
    setSetting(db, 'lifecycle', { ...DEFAULT_RULES, enabled: false });
    expect(evaluateLifecycle(db, now)).toMatchObject({ nudges: [], warnings: [], removals: [] });
  });
});
