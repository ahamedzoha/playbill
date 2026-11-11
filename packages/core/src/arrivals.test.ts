import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

process.env.CONFIG_DIR = mkdtempSync(join(tmpdir(), 'playbill-arr-'));

const { dueArrivals, ensureArrivalsCampaign, isQuiet, planArrivals, reconcileArrivals } = await import('./arrivals');
const { openTestDb } = await import('./db/migrate');
const { arrivals, campaigns, deliveries, people, watchHistory } = await import('./db/schema');
const { setPreference } = await import('./topics');

const DAY = 86_400_000;
const now = 1_800_000_000_000;

type Recent = Record<string, unknown>;
const fakeTautulli = (items: Recent[]) => ({ call: async () => ({ recently_added: items }) }) as never;
const movie = (k: string, title: string, addedAgo = 0): Recent => ({ added_at: Math.floor((now - addedAgo) / 1000), media_type: 'movie', rating_key: k, title, year: 2026, thumb: `/t/${k}`, library_name: 'Movies' });
const episode = (k: string, show: string, showTitle: string, e: number): Recent => ({
  added_at: Math.floor(now / 1000),
  media_type: 'episode',
  rating_key: k,
  grandparent_rating_key: show,
  grandparent_title: showTitle,
  title: `Ep ${e}`,
  parent_media_index: 1,
  media_index: e,
  grandparent_thumb: `/t/${show}`,
  library_name: 'TV',
});

function setup() {
  const { db } = openTestDb();
  const base = { thumb: null, plexLastSeenAt: null, tautulliNotify: null, removedAt: null, syncedAt: 0, invitedAt: now - 400 * DAY, acceptedAt: now - 400 * DAY, firstSeenAt: 0 };
  db.insert(people)
    .values([
      { ...base, plexUserId: 'a', username: 'a', displayName: 'Ann', email: 'a@x.com', status: 'shared', lastPlayedAt: now - DAY },
      { ...base, plexUserId: 'b', username: 'b', displayName: 'Bob', email: 'b@x.com', status: 'shared', lastPlayedAt: now - 2 * DAY },
      { ...base, plexUserId: 'c', username: 'c', displayName: 'Cat', email: 'c@x.com', status: 'shared', lastPlayedAt: now - 200 * DAY },
    ])
    .run();
  // Ann follows show s1.
  db.insert(watchHistory).values({ id: 1, plexUserId: 'a', startedAt: now - 10 * DAY, playSeconds: 1000, mediaType: 'episode', title: 'old', grandparentRatingKey: 's1' }).run();
  const c = ensureArrivalsCampaign(db, now);
  db.update(campaigns).set({ mode: 'live' }).run();
  return { db, campaign: { ...c, mode: 'live' as const } };
}

describe('arrivals', () => {
  it('treats the first sync as backlog and only later additions as news', async () => {
    const { db } = setup();
    await reconcileArrivals(db, fakeTautulli([movie('m0', 'Old one')]), null, now);
    expect(db.select().from(arrivals).all().map((a) => a.alertRunId)).toEqual(['backlog']);
    await reconcileArrivals(db, fakeTautulli([movie('m0', 'Old one'), movie('m1', 'Dune'), movie('m2', 'Stale', 10 * DAY)]), null, now);
    const pending = db.select().from(arrivals).all().filter((a) => a.alertRunId === null);
    expect(pending.map((a) => a.title)).toEqual(['Dune']);
  });

  it('films go to everyone who wants arrivals; episodes only to followers; requesters skipped', async () => {
    const { db, campaign } = setup();
    await reconcileArrivals(db, fakeTautulli([]), null, now);
    await reconcileArrivals(db, fakeTautulli([movie('m1', 'Dune'), episode('e1', 's1', 'Andor', 1), episode('e2', 's1', 'Andor', 2)]), null, now);
    db.update(arrivals).set({ requestedBy: ['b'] }).where(eqKey('m1')).run();
    const pending = dueArrivals(db, { ...(campaign.settings as Record<string, never>), debounceMinutes: 15, quietStart: 0, quietEnd: 0 } as never, 'UTC', now + 20 * 60_000)!;
    expect(pending).toHaveLength(3);
    const plan = planArrivals(db, campaign, pending, now + 20 * 60_000)!;
    const ds = db.select().from(deliveries).all();
    const by = Object.fromEntries(ds.map((d) => [d.email, d.items]));
    // Ann: Dune (broadcast) + Andor (follows). Bob requested Dune and doesn't follow Andor: nothing.
    // Cat hasn't watched in 200 days, so arrivals are off by default for her.
    expect(by).toEqual({ 'a@x.com': ['m1', 's1'] });
    expect(plan.items).toBe(2);
    expect(db.select().from(arrivals).all().every((a) => a.alertRunId !== null)).toBe(true);
  });

  it('respects an explicit opt-in from someone inactive', async () => {
    const { db, campaign } = setup();
    setPreference(db, 'c', 'arrivals', true, 'recipient');
    await reconcileArrivals(db, fakeTautulli([]), null, now);
    await reconcileArrivals(db, fakeTautulli([movie('m1', 'Dune')]), null, now);
    const pending = db.select().from(arrivals).all().filter((a) => a.alertRunId === null);
    planArrivals(db, campaign, pending, now);
    expect(db.select().from(deliveries).all().map((d) => d.email).sort()).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('waits out quiet hours', () => {
    // 23:30 UTC with quiet hours 22–9.
    expect(isQuiet(Date.UTC(2026, 10, 11, 23, 30), 'UTC', 22, 9)).toBe(true);
    expect(isQuiet(Date.UTC(2026, 10, 11, 12, 0), 'UTC', 22, 9)).toBe(false);
  });
});

import { eq } from 'drizzle-orm';
function eqKey(k: string) {
  return eq(arrivals.ratingKey, k);
}
