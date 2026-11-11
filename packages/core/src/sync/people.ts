import { eq, notInArray, sql } from 'drizzle-orm';
import type { PlexFriend, PlexInvite, PlexShare } from '../clients/plextv';
import type { TautulliLibrary, TautulliUser, TautulliUserRow } from '../clients/tautulli';
import type { Db } from '../db';
import { libraries, people, plexShares, watchHistory } from '../db/schema';

export interface PeopleSources {
  ownerId: string;
  tautulliUsers: TautulliUser[];
  tautulliTable: TautulliUserRow[];
  friends: PlexFriend[];
  shares: PlexShare[];
  invites: PlexInvite[];
  libraries: TautulliLibrary[];
}

type Status = (typeof people.$inferSelect)['status'];

export interface PeopleSyncResult {
  total: number;
  byStatus: Record<string, number>;
  newlyRemoved: string[];
}

/** Tautulli's local "Local" user (id 0) and other non-accounts never become people. */
function isRealAccount(id: string): boolean {
  return id !== '0' && id !== '' && id !== 'null';
}

/**
 * Merges Tautulli users with plex.tv's view of friends, shares and pending invites.
 * plex.tv decides status; Tautulli supplies friendly names, last plays and removed users' history.
 * Playbill-only fields (exempt, note, firstSeenAt) are preserved across syncs.
 */
export function applyPeopleSync(db: Db, src: PeopleSources, now = Date.now()): PeopleSyncResult {
  const tUsers = new Map(src.tautulliUsers.filter((u) => isRealAccount(u.user_id)).map((u) => [u.user_id, u]));
  const tRows = new Map(src.tautulliTable.map((r) => [r.user_id, r]));
  const friends = new Map(src.friends.map((f) => [f.id, f]));
  const shares = new Map(src.shares.map((s) => [s.userId, s]));

  const ids = new Set<string>([src.ownerId, ...tUsers.keys(), ...friends.keys(), ...shares.keys()]);
  // Invites to people who aren't friends yet have no account id we know; key them by invite id.
  const inviteOnly = src.invites.filter((i) => !friends.has(i.id) && !shares.has(i.id));

  const existing = new Map(db.select().from(people).all().map((p) => [p.plexUserId, p]));
  const result: PeopleSyncResult = { total: 0, byStatus: {}, newlyRemoved: [] };

  db.transaction((tx) => {
    for (const id of ids) {
      const t = tUsers.get(id);
      const f = friends.get(id);
      const s = shares.get(id);
      const prev = existing.get(id);

      let status: Status;
      if (id === src.ownerId) status = 'owner';
      else if (f?.home) status = 'home';
      else if (s && s.acceptedAt) status = 'shared';
      else if (s || f?.server?.pending) status = 'pending';
      else if (f?.server) status = 'shared';
      else status = 'removed';

      const username = f?.username || t?.username || s?.username || prev?.username || `user-${id}`;
      const row = {
        plexUserId: id,
        username,
        displayName: t?.friendly_name || f?.title || username,
        email: f?.email ?? s?.email ?? t?.email ?? prev?.email ?? null,
        thumb: f?.thumb ?? t?.thumb ?? prev?.thumb ?? null,
        status,
        invitedAt: s?.invitedAt ?? prev?.invitedAt ?? null,
        acceptedAt: s?.acceptedAt ?? prev?.acceptedAt ?? null,
        plexLastSeenAt: f?.server?.lastSeenAt ?? prev?.plexLastSeenAt ?? null,
        lastPlayedAt: tRows.get(id)?.last_seen ? tRows.get(id)!.last_seen! * 1000 : (prev?.lastPlayedAt ?? null),
        tautulliNotify: t?.do_notify ?? prev?.tautulliNotify ?? null,
        firstSeenAt: prev?.firstSeenAt ?? s?.invitedAt ?? now,
        removedAt: status === 'removed' ? (prev?.removedAt ?? now) : null,
        syncedAt: now,
      };
      if (status === 'removed' && prev && prev.status !== 'removed') result.newlyRemoved.push(id);

      tx.insert(people)
        .values(row)
        .onConflictDoUpdate({ target: people.plexUserId, set: row })
        .run();

      if (s) {
        const share = {
          plexUserId: id,
          shareId: s.shareId,
          allLibraries: s.allLibraries,
          sectionIds: s.sectionIds,
          allowSync: s.allowSync,
          filters: f?.filters ?? null,
          pending: !s.acceptedAt,
          syncedAt: now,
        };
        tx.insert(plexShares).values(share).onConflictDoUpdate({ target: plexShares.plexUserId, set: share }).run();
      }
      result.byStatus[status] = (result.byStatus[status] ?? 0) + 1;
      result.total++;
    }

    for (const inv of inviteOnly) {
      const id = `invite:${inv.id}`;
      const prev = existing.get(id);
      const row = {
        plexUserId: id,
        username: inv.username || inv.email || 'invited',
        displayName: inv.friendlyName || inv.username || inv.email || 'Invited',
        email: inv.email,
        thumb: inv.thumb,
        status: 'pending' as const,
        invitedAt: inv.createdAt,
        acceptedAt: null,
        plexLastSeenAt: null,
        lastPlayedAt: null,
        tautulliNotify: null,
        firstSeenAt: prev?.firstSeenAt ?? inv.createdAt ?? now,
        removedAt: null,
        syncedAt: now,
      };
      tx.insert(people).values(row).onConflictDoUpdate({ target: people.plexUserId, set: row }).run();
      result.byStatus.pending = (result.byStatus.pending ?? 0) + 1;
      result.total++;
    }

    // Invites that were accepted or cancelled since the last sync.
    const live = [...ids, ...inviteOnly.map((i) => `invite:${i.id}`)];
    tx.delete(people)
      .where(sql`${people.plexUserId} like 'invite:%' and ${notInArray(people.plexUserId, live)}`)
      .run();
    // Shares that no longer exist.
    tx.delete(plexShares).where(notInArray(plexShares.plexUserId, [...shares.keys()])).run();

    for (const l of src.libraries) {
      const lib = {
        sectionId: l.section_id,
        name: l.section_name,
        type: l.section_type,
        itemCount: l.count,
        active: l.is_active,
        syncedAt: now,
      };
      tx.insert(libraries).values(lib).onConflictDoUpdate({ target: libraries.sectionId, set: lib }).run();
    }
  });

  return result;
}

/** After a history sync, the newest play per person is more precise than Tautulli's users table. */
export function refreshLastPlayed(db: Db): void {
  db.run(sql`
    update people set last_played_at = (
      select max(started_at) from ${watchHistory} where ${watchHistory.plexUserId} = ${people.plexUserId}
    )
    where exists (select 1 from ${watchHistory} where ${watchHistory.plexUserId} = ${people.plexUserId})`);
}

export function personById(db: Db, id: string) {
  return db.select().from(people).where(eq(people.plexUserId, id)).get() ?? null;
}
