import { join } from 'node:path';
import { config, logger } from '@playbill/core';
import { pruneSessions } from '@playbill/core/auth';
import { backupDatabase, dateLabel, pruneBackups } from '@playbill/core/backup';
import { getFriends, getPendingInvites, getShares, inviteCoversServer } from '@playbill/core/clients/plextv';
import { tautulliReader } from '@playbill/core/clients/tautulli';
import { getSqlite, type Db } from '@playbill/core/db';
import { libraries } from '@playbill/core/db/schema';
import { tautulli } from '@playbill/core/integrations';
import { ownerCredentials } from '@playbill/core/owner';
import type { Job, Queue } from '@playbill/core/queue';
import { getSetting } from '@playbill/core/settings';
import { syncHistory } from '@playbill/core/sync/history';
import { applyPeopleSync, refreshLastPlayed } from '@playbill/core/sync/people';

const log = logger('jobs');

export interface JobContext {
  db: Db;
  queue: Queue;
  job: Job;
}

export type Handler = (payload: Record<string, unknown>, ctx: JobContext) => Promise<void>;

const BACKUPS_KEPT = 7;

/** Everything the syncs need, or null (with a reason logged) when setup isn't finished. */
function syncDeps(db: Db) {
  const creds = ownerCredentials(db);
  const plex = getSetting(db, 'plex');
  const owner = getSetting(db, 'owner');
  const client = tautulli(db);
  if (!creds || !plex || !owner || !client) {
    log.debug('sync skipped: setup not finished');
    return null;
  }
  return { creds, plex, owner, reader: tautulliReader(client) };
}

async function syncPeople(db: Db): Promise<void> {
  const deps = syncDeps(db);
  if (!deps) return;
  const { creds, plex, owner, reader } = deps;
  const [tautulliUsers, tautulliTable, libs, friends, shares, invites] = await Promise.all([
    reader.users(),
    reader.usersTable(),
    reader.libraries(),
    getFriends(creds.clientId, creds.token, plex.machineId),
    getShares(creds.clientId, creds.token, plex.machineId),
    getPendingInvites(creds.clientId, creds.token),
  ]);
  const result = applyPeopleSync(db, {
    ownerId: owner.plexUserId,
    tautulliUsers,
    tautulliTable,
    friends,
    shares,
    invites: invites.filter((i) => inviteCoversServer(i, plex)),
    libraries: libs,
  });
  refreshLastPlayed(db);
  log.info('people synced', { total: result.total, ...result.byStatus, newlyRemoved: result.newlyRemoved.length });
}

/** Every job type the worker knows. Handlers must be safe to run twice (leases can expire). */
export const handlers: Record<string, Handler> = {
  async backup() {
    const dir = join(config().configDir, 'backups');
    const file = await backupDatabase(getSqlite(), dir, dateLabel());
    const removed = pruneBackups(dir, BACKUPS_KEPT);
    log.info('database backed up', { file, removed: removed.length });
  },

  async maintenance(_payload, { db, queue }) {
    const jobs = queue.prune(Date.now() - 14 * 24 * 3_600_000);
    const sessions = pruneSessions(db);
    log.info('maintenance done', { jobsPruned: jobs, sessionsPruned: sessions });
  },

  async 'sync.people'(_payload, { db }) {
    await syncPeople(db);
  },

  async 'sync.history'(_payload, { db, queue, job }) {
    const deps = syncDeps(db);
    if (!deps) return;
    // History is tagged by library, so libraries must be known first.
    if (!db.select({ id: libraries.sectionId }).from(libraries).limit(1).get()) await syncPeople(db);
    let total = 0;
    for (;;) {
      const r = await syncHistory(db, deps.reader);
      total += r.rows;
      if (!r.more) {
        log.info(`history synced (${r.mode})`, { rows: total });
        break;
      }
      log.info('history backfill in progress', { rows: total });
      if (!queue.extend(job)) throw new Error('lost the job lease during backfill');
    }
    refreshLastPlayed(db);
  },
};
