import { join } from 'node:path';
import { eq, isNull } from 'drizzle-orm';
import { type Campaign, advanceRun, campaignSettings } from '@playbill/core/campaigns';
import { isDryRun, mailer } from '@playbill/core/mail';
import { renderArrivalsEmail, renderDigestEmail, renderLeavingEmail, renderLifecycleEmail, renderRecapEmail } from '@playbill/emails';
import { planLeavingNotices, syncLibrary, type LeavingContent } from '@playbill/core/library';
import type { RecapContent } from '@playbill/core/recap';
import { evaluateLifecycle, executeRemoval, queueLifecycleEmails, type LifecycleContent } from '@playbill/core/lifecycle';
import { arrivalsSettings, dueArrivals, ensureArrivalsCampaign, planArrivals, reconcileArrivals, type ArrivalsContent } from '@playbill/core/arrivals';
import { config, logger } from '@playbill/core';
import { pruneActivity } from '@playbill/core/activity';
import { pruneSessions } from '@playbill/core/auth';
import { backupDatabase, dateLabel, pruneBackups } from '@playbill/core/backup';
import { getFriends, getPendingInvites, getShares, inviteCoversServer } from '@playbill/core/clients/plextv';
import { tautulliReader } from '@playbill/core/clients/tautulli';
import { getSqlite, type Db } from '@playbill/core/db';
import { arrivals, campaigns, libraries, runs } from '@playbill/core/db/schema';
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
    const activity = pruneActivity(db);
    log.info('maintenance done', { jobsPruned: jobs, sessionsPruned: sessions, activityPruned: activity.deleted, activityMb: Math.round(activity.bytes / 1_048_576) });
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
  const s =
    campaign.kind === 'digest'
      ? campaignSettings(campaign)
      : campaign.kind === 'arrivals'
        ? { ...arrivalsSettings.parse(campaign.settings), subject: '', intro: '' }
        : { signature: String((campaign.settings as { signature?: string }).signature ?? 'Plex'), subject: '', intro: '' }; // lifecycle, recap
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
    render: (content, r, id, items, c) =>
      c.kind === 'arrivals'
        ? renderArrivalsEmail(content as unknown as ArrivalsContent, ctx, r, id, items)
        : c.kind === 'lifecycle'
          ? renderLifecycleEmail(content as unknown as LifecycleContent, ctx, r, id)
          : c.kind === 'recap'
            ? renderRecapEmail(content as unknown as RecapContent, ctx, r, id)
            : c.kind === 'leaving'
              ? renderLeavingEmail(content as unknown as LeavingContent, ctx, r, id, items)
              : renderDigestEmail(content, ctx, r, id),
    pauseMs: 600,
    keepGoing: () => queue.extend(job),
  });
  log.info(`run ${runId}: ${result.status}`, { sent: result.sent, failed: result.failed });
  if (result.status === 'deferred' || result.status === 'sending') {
    const at = result.retryAt ?? Date.now() + 5_000;
    queue.enqueue('campaign.run', { runId }, { runAt: at, dedupeKey: `run:${runId}:${at}` });
  }
};

/**
 * Every 15 minutes: record new arrivals, and when a batch is due (and alerts are on), plan and send it.
 * While alerts are off, new arrivals are marked as passed, so switching them on never floods anyone.
 */
handlers['arrivals.check'] = async (_payload, { db, queue }) => {
  const client = tautulli(db);
  if (!client) return;
  const campaign = ensureArrivalsCampaign(db);
  const r = await reconcileArrivals(db, client, seerr(db));
  if (r.added) log.info('new arrivals recorded', { added: r.added, backlog: r.backlog });
  if (!campaign.enabled) {
    db.update(arrivals).set({ alertRunId: 'paused' }).where(isNull(arrivals.alertRunId)).run();
    return;
  }
  const tz = getSetting(db, 'general')?.timezone ?? process.env.TZ ?? 'UTC';
  const pending = dueArrivals(db, arrivalsSettings.parse(campaign.settings), tz);
  if (!pending) return;
  const plan = planArrivals(db, campaign, pending);
  if (plan && plan.recipients > 0) {
    log.info('arrivals run planned', { ...plan });
    queue.enqueue('campaign.run', { runId: plan.runId }, { dedupeKey: `run:${plan.runId}` });
  }
};

/** Nightly: cancel what's moot, queue nudges and warnings (when switched on), propose removals. */
handlers['lifecycle.evaluate'] = async (_payload, { db, queue }) => {
  const r = evaluateLifecycle(db);
  const runIds = queueLifecycleEmails(db);
  for (const id of runIds) queue.enqueue('campaign.run', { runId: id }, { dedupeKey: `run:${id}` });
  log.info('lifecycle evaluated', { nudges: r.nudges.length, warnings: r.warnings.length, removals: r.removals.length, cancelled: r.cancelled, emails: runIds.length });
};

/** Sends any account notice that was queued from the UI (a nudge from the person page). */
handlers['lifecycle.send'] = async (_payload, { db, queue }) => {
  for (const id of queueLifecycleEmails(db)) queue.enqueue('campaign.run', { runId: id }, { dedupeKey: `run:${id}` });
};

/** Carries out an approved removal on plex.tv, then refreshes people. */
handlers['lifecycle.remove'] = async (payload, { db, queue }) => {
  await executeRemoval(db, String(payload.actionId));
  for (const run of db.select().from(runs).where(eq(runs.windowKey, `life:${String(payload.actionId)}:goodbye`)).all()) {
    queue.enqueue('campaign.run', { runId: run.id }, { dedupeKey: `run:${run.id}` });
  }
  queue.enqueue('sync.people', {}, { dedupeKey: 'schedule:sync.people', runAt: Date.now() + 30_000 });
};

/** Daily: refresh the library list with play counts and sizes. */
handlers['sync.library'] = async (_payload, { db }) => {
  const client = tautulli(db);
  if (!client) return;
  log.info('library synced', { titles: await syncLibrary(db, client) });
};

/** Daily: send leaving-soon notices for titles whose notice window has opened. */
handlers['leaving.check'] = async (_payload, { db, queue }) => {
  const runId = planLeavingNotices(db);
  if (runId) queue.enqueue('campaign.run', { runId }, { dedupeKey: `run:${runId}` });
};
