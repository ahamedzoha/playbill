import { describe, expect, it } from 'vitest';
import { openTestDb } from './db/migrate';
import { people, watchHistory } from './db/schema';
import { buildRecap, previousMonth } from './recap';

describe('previousMonth', () => {
  it('is the calendar month before, at local midnight', () => {
    // 1 Dec 2026 10:00 in Dhaka (UTC+6) = 04:00 UTC.
    const m = previousMonth(Date.UTC(2026, 11, 1, 4), 'Asia/Dhaka');
    expect(new Date(m.start).toISOString()).toBe('2026-10-31T18:00:00.000Z');
    expect(new Date(m.end).toISOString()).toBe('2026-11-30T18:00:00.000Z');
    expect(m.label).toBe('November 2026');
    expect(previousMonth(Date.UTC(2026, 0, 5), 'UTC').label).toBe('December 2025');
  });
});

describe('buildRecap', () => {
  it('summarises each person who watched, with top titles and unfinished films', () => {
    const { db } = openTestDb();
    const base = { thumb: null, email: null, plexLastSeenAt: null, tautulliNotify: null, removedAt: null, syncedAt: 0, invitedAt: 0, acceptedAt: 0, lastPlayedAt: null, firstSeenAt: 0 };
    db.insert(people).values({ ...base, plexUserId: 'a', username: 'a', displayName: 'Ann Lee', status: 'shared' }).run();
    const nov = (d: number) => Date.UTC(2026, 10, d, 15);
    let id = 1;
    const play = (d: number, secs: number, title: string, extra = {}) => ({ id: id++, plexUserId: 'a', startedAt: nov(d), playSeconds: secs, mediaType: 'episode', title: 'x', grandparentTitle: title, ...extra });
    db.insert(watchHistory)
      .values([
        play(2, 3 * 3600, 'Andor'),
        play(3, 3600, 'Andor'),
        play(9, 1800, 'Severance'),
        { id: id++, plexUserId: 'a', startedAt: nov(10), playSeconds: 1200, mediaType: 'movie', title: 'Dune', ratingKey: 'm1', percentComplete: 40 },
      ])
      .run();
    const r = buildRecap(db, Date.UTC(2026, 11, 1, 10), 'UTC').people.a!;
    expect(r).toMatchObject({ name: 'Ann Lee', plays: 4, activeDays: 4 });
    expect(r.top[0]).toEqual({ title: 'Andor', hours: 4 });
    expect(r.unfinished).toEqual([{ title: 'Dune', percent: 40 }]);
  });
});
