import { describe, expect, it } from 'vitest';
import { openTestDb } from './db/migrate';
import { people, watchHistory } from './db/schema';
import { previewArrivals, previewLeaving, previewLifecycle, previewRecap } from './preview';

const base = { thumb: null, email: null, plexLastSeenAt: null, tautulliNotify: null, removedAt: null, syncedAt: 0, invitedAt: 0, acceptedAt: 0, lastPlayedAt: null, firstSeenAt: 0 };

describe('previews', () => {
  it('has nothing to show on an empty install, and never invents content', () => {
    const { db } = openTestDb();
    db.insert(people).values({ ...base, plexUserId: 'a', username: 'a', displayName: 'Ann Lee', status: 'shared' }).run();
    const ann = db.select().from(people).get()!;
    expect(previewArrivals(db, ann, 30)).toBeNull();
    expect(previewRecap(db, ann, 'UTC')).toBeNull();
    expect(previewLeaving(db, ann)).toBeNull();
    // Account notices need a person; with one they describe today's hypothetical send.
    expect(previewLifecycle(db, null, 'nudge', 'Server')).toBeNull();
    expect(previewLifecycle(db, ann, 'warning', 'Server')?.note).toBe('What Ann would get if an access warning went out today.');
  });

  it("shows the busiest watcher's recap, named, when the chosen person watched nothing", () => {
    const { db } = openTestDb();
    db.insert(people).values([
      { ...base, plexUserId: 'a', username: 'a', displayName: 'Ann Lee', status: 'shared' },
      { ...base, plexUserId: 'b', username: 'b', displayName: 'Bo Chen', status: 'shared' },
    ]).run();
    db.insert(watchHistory).values({ id: 1, plexUserId: 'b', startedAt: Date.UTC(2026, 10, 5, 15), playSeconds: 3600, mediaType: 'movie', title: 'Dune', ratingKey: 'm1' }).run();
    const ann = db.select().from(people).all().find((p) => p.plexUserId === 'a')!;
    const pv = previewRecap(db, ann, 'UTC', Date.UTC(2026, 11, 1, 10))!;
    expect(pv.recipient?.plexUserId).toBe('b');
    expect(pv.note).toBe("Ann watched nothing in November 2026, so this shows Bo's recap. Recaps only go to their own person.");
  });
});
