import { describe, expect, it } from 'vitest';
import type { PlexFriend, PlexShare } from '../clients/plextv';
import type { TautulliUser } from '../clients/tautulli';
import { openTestDb } from '../db/migrate';
import { people, plexShares } from '../db/schema';
import { applyPeopleSync, type PeopleSources } from './people';

const tUser = (id: string, name: string): TautulliUser => ({
  user_id: id,
  username: name,
  friendly_name: name.toUpperCase(),
  email: `${name}@example.com`,
  thumb: null,
  is_active: true,
  is_home_user: false,
  is_admin: false,
  keep_history: true,
});
const friend = (id: string, name: string, extra: Partial<PlexFriend> = {}): PlexFriend => ({
  id,
  username: name,
  title: name,
  email: `${name}@example.com`,
  thumb: null,
  home: false,
  restricted: false,
  allowSync: false,
  filters: {},
  server: { pending: false, lastSeenAt: 5000, allLibraries: false, numLibraries: 2 },
  ...extra,
});
const share = (userId: string, accepted: boolean): PlexShare => ({
  shareId: `s${userId}`,
  userId,
  username: `u${userId}`,
  email: null,
  invitedAt: 1000,
  acceptedAt: accepted ? 2000 : null,
  allLibraries: false,
  allowSync: true,
  sectionIds: ['1', '2'],
});

function sources(over: Partial<PeopleSources> = {}): PeopleSources {
  return {
    ownerId: '1',
    tautulliUsers: [tUser('0', 'Local'), tUser('1', 'owner'), tUser('2', 'ann'), tUser('3', 'bob'), tUser('9', 'gone')],
    tautulliTable: [{ user_id: '2', last_seen: 1_700_000_000, plays: 10, duration: 100 }],
    friends: [friend('2', 'ann'), friend('3', 'bob'), friend('4', 'kid', { home: true, server: null })],
    shares: [share('2', true), share('3', false)],
    invites: [
      { id: '77', email: 'new@example.com', username: null, friendlyName: null, thumb: null, createdAt: 3000, servers: [] },
    ],
    libraries: [{ section_id: '1', section_name: 'Movies', section_type: 'movie', count: 10, is_active: true }],
    ...over,
  };
}

describe('applyPeopleSync', () => {
  it('derives status from plex.tv and skips Tautulli’s Local user', () => {
    const { db } = openTestDb();
    const r = applyPeopleSync(db, sources(), 10_000);
    const byId = Object.fromEntries(db.select().from(people).all().map((p) => [p.plexUserId, p]));
    expect(byId['0']).toBeUndefined();
    expect(byId['1']?.status).toBe('owner');
    expect(byId['2']).toMatchObject({ status: 'shared', displayName: 'ANN', lastPlayedAt: 1_700_000_000_000, acceptedAt: 2000 });
    expect(byId['3']?.status).toBe('pending');
    expect(byId['4']?.status).toBe('home');
    expect(byId['9']).toMatchObject({ status: 'removed', removedAt: 10_000 });
    expect(byId['invite:77']).toMatchObject({ status: 'pending', email: 'new@example.com' });
    expect(r.byStatus).toEqual({ owner: 1, shared: 1, pending: 2, home: 1, removed: 1 });
    expect(db.select().from(plexShares).all().map((s) => s.plexUserId).sort()).toEqual(['2', '3']);
  });

  it('keeps Playbill-only fields and records removals once', () => {
    const { db } = openTestDb();
    applyPeopleSync(db, sources(), 10_000);
    db.update(people).set({ exempt: true, note: 'family' }).run();
    // Ann's share is gone and the invite was accepted (it disappears from the invite list).
    const r = applyPeopleSync(
      db,
      sources({ friends: [friend('3', 'bob')], shares: [share('3', true)], invites: [] }),
      20_000,
    );
    expect(r.newlyRemoved).toEqual(['2']);
    const ann = db.select().from(people).all().find((p) => p.plexUserId === '2')!;
    expect(ann).toMatchObject({ status: 'removed', removedAt: 20_000, exempt: true, note: 'family' });
    expect(db.select().from(people).all().some((p) => p.plexUserId === 'invite:77')).toBe(false);
    expect(db.select().from(plexShares).all().map((s) => s.plexUserId)).toEqual(['3']);
    const again = applyPeopleSync(db, sources({ friends: [friend('3', 'bob')], shares: [share('3', true)], invites: [] }), 30_000);
    expect(again.newlyRemoved).toEqual([]);
  });
});
