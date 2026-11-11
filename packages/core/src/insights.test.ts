import { describe, expect, it } from 'vitest';
import { openTestDb } from './db/migrate';
import { people, watchHistory } from './db/schema';
import { DAY, WEEK, markLevel, overview, weeklyMarks } from './insights';

const now = 1_800_000_000_000;

function seed() {
  const { db } = openTestDb();
  const base = { thumb: null, email: null, plexLastSeenAt: null, tautulliNotify: null, removedAt: null, syncedAt: now };
  const mk = (id: string, status: 'owner' | 'shared' | 'home' | 'pending' | 'removed', last: number | null, joinedDaysAgo = 400) => ({
    ...base,
    plexUserId: id,
    username: id,
    displayName: id.toUpperCase(),
    status,
    invitedAt: now - (joinedDaysAgo + 1) * DAY,
    acceptedAt: status === 'pending' ? null : now - joinedDaysAgo * DAY,
    lastPlayedAt: last,
    firstSeenAt: now - joinedDaysAgo * DAY,
  });
  db.insert(people)
    .values([
      mk('owner', 'owner', now - DAY),
      mk('ann', 'shared', now - 2 * DAY),
      mk('bob', 'shared', now - 45 * DAY),
      mk('cat', 'shared', now - 120 * DAY),
      mk('dan', 'shared', now - 300 * DAY),
      mk('eve', 'shared', null),
      mk('fay', 'pending', null, 10),
      mk('gus', 'removed', now - 500 * DAY),
    ])
    .run();
  let id = 1;
  const play = (user: string, ago: number, seconds: number, title = 'Show') => ({
    id: id++,
    plexUserId: user,
    startedAt: now - ago,
    playSeconds: seconds,
    mediaType: 'episode',
    title: 'Ep',
    grandparentTitle: title,
  });
  db.insert(watchHistory)
    .values([
      play('ann', 2 * DAY, 2 * 3600, 'Severance'),
      play('ann', 3 * DAY, 30 * 60, 'Severance'),
      play('ann', 9 * DAY, 9 * 3600, 'Andor'),
      play('owner', DAY, 3600),
      play('bob', 45 * DAY, 3600),
    ])
    .run();
  return db;
}

describe('markLevel', () => {
  it('bins hours per week', () => {
    expect([0, 1800, 3600, 3 * 3600, 8 * 3600].map(markLevel)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('weeklyMarks', () => {
  it('puts plays in rolling weeks, oldest first, with the top title', () => {
    const db = seed();
    const ann = weeklyMarks(db, ['ann', 'eve'], now, 4).get('ann')!;
    expect(ann.map((c) => c.index)).toEqual([3, 2, 1, 0]);
    expect(ann[3]).toMatchObject({ plays: 2, seconds: 2.5 * 3600, level: 2, topTitle: 'Severance' });
    expect(ann[2]).toMatchObject({ plays: 1, level: 4, topTitle: 'Andor' });
    expect(weeklyMarks(db, ['eve'], now, 4).get('eve')!.every((c) => c.level === 0)).toBe(true);
    expect(ann[3]!.end - ann[3]!.start).toBe(WEEK);
  });
});

describe('overview', () => {
  it('counts the audience, writes plain housekeeping, and lists who slipped', () => {
    const db = seed();
    const o = overview(db, now, 7, 'UTC');
    // Audience: shared + home only (owner, pending and removed excluded).
    expect(o.audience).toBe(5);
    expect(o.watched).toBe(1);
    expect(o.watchedBefore).toBe(1);
    expect(o.housekeeping.map((h) => h.id)).toEqual(['inactive', 'pending', 'dormant', 'never', 'cooling']);
    expect(o.housekeeping[0]).toMatchObject({ decision: true, text: "1 person hasn't watched anything in over 6 months." });
    expect(o.attention.map((p) => p.id)).toEqual(['bob', 'cat', 'dan', 'eve']);
  });

  it('leaves exempt people out of housekeeping', () => {
    const db = seed();
    db.update(people).set({ exempt: true }).run();
    expect(overview(db, now, 7, 'UTC').housekeeping.filter((h) => h.id !== 'pending')).toEqual([]);
  });
});
