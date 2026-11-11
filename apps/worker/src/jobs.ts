import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { type Campaign, advanceRun, campaignSettings } from '@playbill/core/campaigns';
import { isDryRun, mailer } from '@playbill/core/mail';
import { renderDigestEmail } from '@playbill/emails';
import { config, logger } from '@playbill/core';
import { pruneSessions } from '@playbill/core/auth';
import { backupDatabase, dateLabel, pruneBackups } from '@playbill/core/backup';
import { getFriends, getPendingInvites, getShares, inviteCoversServer } from '@playbill/core/clients/plextv';
import { tautulliReader } from '@playbill/core/clients/tautulli';
import { getSqlite, type Db } from '@playbill/core/db';
import { campaigns, libraries, runs } from '@playbill/core/db/schema';
import { radarrs, seerr, sonarrs, tautulli } from '@playbill/core/integrations';
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

// ---------------------------------------------------------------------------------------------
// Newsletters

function renderContext(db: Db, campaign: Campaign) {
  const s = campaignSettings(campaign);
  const general = getSetting(db, 'general');
  const publicUrl = general?.publicUrl ?? (isDryRun() ? 'http://localhost:3000' : null);
  return {
    publicUrl,
    ctx: {
      publicUrl: publicUrl ?? '',
      serverName: getSetting(db, 'plex')?.name ?? 'Plex',
      signature: s.signature,
      subject: s.subject,
      intro: s.intro,
      tz: general?.timezone ?? process.env.TZ ?? 'UTC',
      topic: campaign.topic,
    },
  };
}

handlers['campaign.run'] = async (payload, { db, queue, job }) => {
  const runId = String(payload.runId);
  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) return;
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, run.campaignId)).get();
  if (!campaign) return;
  const { publicUrl, ctx } = renderContext(db, campaign);
  if (!publicUrl) {
    db.update(runs).set({ status: 'deferred', note: 'Set the public URL in Settings so emails can link back and show images', updatedAt: Date.now() }).where(eq(runs.id, runId)).run();
    queue.enqueue('campaign.run', { runId }, { runAt: Date.now() + 3_600_000, dedupeKey: `run:${runId}:${Date.now()}` });
    return;
  }
  const client = tautulli(db);
  const result = await advanceRun(db, runId, {
    sources: { tautulli: client, seerr: seerr(db), sonarrs: sonarrs(db), radarrs: radarrs(db) },
    mailer: mailer(db),
    render: (content, r, id) => renderDigestEmail(content, ctx, r, id),
    pauseMs: 600,
    keepGoing: () => queue.extend(job),
  });
  log.info(`run ${runId}: ${result.status}`, { sent: result.sent, failed: result.failed });
  if (result.status === 'deferred' || result.status === 'sending') {
    const at = result.retryAt ?? Date.now() + 5_000;
    queue.enqueue('campaign.run', { runId }, { runAt: at, dedupeKey: `run:${runId}:${at}` });
  }
};
