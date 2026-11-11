import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { audit } from './audit';
import { cancelInvite, inviteFriend, removeFriend, updateShareLibraries } from './clients/plextv';
import type { Db } from './db';
import { arrivals, campaigns, deliveries, lifecycleActions, people, plexShares, runs, watchHistory } from './db/schema';
import { newId } from './ids';
import type { ImageRef } from './links';
import { ownerCredentials } from './owner';
import { getSetting, type SettingValue } from './settings';
import { normalEmail, suppression, topicPreferences } from './topics';

const DAY = 86_400_000;

export type LifecycleRules = SettingValue<'lifecycle'>;
export const DEFAULT_RULES: LifecycleRules = { enabled: false, nudgeDays: 60, warnDays: 165, removeDays: 180, graceDays: 14, sendGoodbye: true };

export function lifecycleRules(db: Db): LifecycleRules {
  return getSetting(db, 'lifecycle') ?? DEFAULT_RULES;
}

export type Action = typeof lifecycleActions.$inferSelect;
type Person = typeof people.$inferSelect;

/** When someone's current quiet stretch started: their last play, else when they joined. */
function idleSince(p: Person): number | null {
  return p.lastPlayedAt ?? p.acceptedAt ?? p.invitedAt ?? null;
}

function newAction(db: Db, p: Person, kind: Action['kind'], status: Action['status'], reason: string, now: number, extra: Partial<Action> = {}): Action {
  const row: Action = {
    id: newId('act'),
    plexUserId: p.plexUserId,
    kind,
    status,
    reason,
    deadline: null,
    lastPlayedAt: p.lastPlayedAt,
    runId: null,
    snapshot: null,
    decidedBy: null,
    decidedAt: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
  db.insert(lifecycleActions).values(row).run();
  return row;
}

/** Actions in this person's current quiet stretch (created since their last play). */
function stretchActions(db: Db, p: Person): Action[] {
  return db
    .select()
    .from(lifecycleActions)
    .where(and(eq(lifecycleActions.plexUserId, p.plexUserId), p.lastPlayedAt === null ? sql`${lifecycleActions.lastPlayedAt} is null` : eq(lifecycleActions.lastPlayedAt, p.lastPlayedAt)))
    .all();
}

export interface Evaluation {
  nudges: Action[];
  warnings: Action[];
  removals: Action[];
  cancelled: number;
}

/**
 * The nightly housekeeping pass. Only shared friends are considered: never you, never Plex Home
 * members, never anyone marked exempt. Emails are only queued when the rules are switched on;
 * removals are only ever proposed, for the owner to approve.
 */
export function evaluateLifecycle(db: Db, now = Date.now()): Evaluation {
  const rules = lifecycleRules(db);
  const out: Evaluation = { nudges: [], warnings: [], removals: [], cancelled: 0 };
  const everyone = new Map(db.select().from(people).all().map((p) => [p.plexUserId, p]));

  // Anyone who watched again, or whose share ended some other way, is off the hook.
  for (const a of db.select().from(lifecycleActions).where(inArray(lifecycleActions.status, ['queued', 'awaiting'])).all()) {
    const p = everyone.get(a.plexUserId);
    const watched = p && p.lastPlayedAt !== null && (a.lastPlayedAt === null || p.lastPlayedAt > a.lastPlayedAt);
    const gone = !p || p.status !== 'shared' || p.exempt;
    if (watched || gone) {
      db.update(lifecycleActions)
        .set({ status: 'cancelled', reason: watched ? 'Watched again' : p?.exempt ? 'Marked exempt' : 'No longer shared', updatedAt: now })
        .where(eq(lifecycleActions.id, a.id))
        .run();
      out.cancelled++;
    }
  }
  if (!rules.enabled) return out;

  for (const p of everyone.values()) {
    if (p.status !== 'shared' || p.exempt) continue;
    const since = idleSince(p);
    if (since === null) continue;
    const idle = Math.floor((now - since) / DAY);
    const stretch = stretchActions(db, p);
    const has = (k: Action['kind'], st?: Action['status'][]) => stretch.some((a) => a.kind === k && (!st || st.includes(a.status)));

    if (idle >= rules.removeDays) {
      const warning = stretch.find((a) => a.kind === 'warning' && a.status === 'sent');
      if (warning && (warning.deadline ?? 0) <= now && !has('removal', ['awaiting', 'approved', 'done'])) {
        out.removals.push(newAction(db, p, 'removal', 'awaiting', `No plays in ${idle} days, and the warning's deadline passed`, now));
        continue;
      }
    }
    if (idle >= rules.warnDays && !has('warning') && p.email) {
      out.warnings.push(newAction(db, p, 'warning', 'queued', `No plays in ${idle} days`, now, { deadline: now + rules.graceDays * DAY }));
      continue;
    }
    if (idle >= rules.nudgeDays && idle < rules.warnDays && !has('nudge') && p.email) {
      out.nudges.push(newAction(db, p, 'nudge', 'queued', `No plays in ${idle} days`, now));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Emails

export interface LifecycleItem {
  title: string;
  detail: string;
  image: ImageRef | null;
}

export type LifecycleContent =
  | { type: 'nudge'; serverName: string; lastTitle: string | null; lastPlayedAt: number | null; items: LifecycleItem[] }
  | { type: 'warning'; serverName: string; deadline: number; lastPlayedAt: number | null; items: LifecycleItem[] }
  | { type: 'goodbye'; serverName: string };

export function ensureLifecycleCampaign(db: Db, now = Date.now()) {
  const existing = db.select().from(campaigns).where(eq(campaigns.kind, 'lifecycle')).get();
  if (existing) return existing;
  const signature = String((db.select().from(campaigns).where(eq(campaigns.kind, 'digest')).get()?.settings as { signature?: string } | undefined)?.signature ?? getSetting(db, 'plex')?.name ?? 'Plex');
  const row = {
    id: newId('cmp'),
    kind: 'lifecycle' as const,
    name: 'Account notices',
    topic: 'account',
    enabled: true,
    mode: 'live' as const,
    cron: '0 4 * * *',
    settings: { signature },
    lastOccurrence: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(campaigns).values(row).run();
  return db.select().from(campaigns).where(eq(campaigns.id, row.id)).get()!;
}

/** What's new since they last watched: arrivals since then, shows they watched first. */
function newSince(db: Db, p: Person, since: number): LifecycleItem[] {
  const watchedShows = new Set(
    db
      .selectDistinct({ k: watchHistory.grandparentRatingKey })
      .from(watchHistory)
      .where(eq(watchHistory.plexUserId, p.plexUserId))
      .all()
      .map((r) => r.k)
      .filter(Boolean) as string[],
  );
  const rows = db.select().from(arrivals).where(gt(arrivals.addedAt, since)).orderBy(desc(arrivals.addedAt)).limit(200).all();
  const groups = new Map<string, { title: string; kind: string; n: number; image: ImageRef | null; year: number | null; mine: boolean }>();
  for (const r of rows) {
    const g = groups.get(r.groupKey) ?? { title: r.groupTitle, kind: r.kind, n: 0, image: (r.image as ImageRef | null) ?? null, year: r.year, mine: watchedShows.has(r.groupKey) };
    g.n++;
    groups.set(r.groupKey, g);
  }
  return [...groups.values()]
    .sort((a, b) => Number(b.mine) - Number(a.mine))
    .slice(0, 6)
    .map((g) => ({
      title: g.title,
      detail: g.kind === 'movie' ? (g.year ? String(g.year) : 'Film') : g.mine ? `${g.n} new ${g.n === 1 ? 'episode' : 'episodes'} of a show you watch` : g.n === 1 ? 'New episode' : `${g.n} new episodes`,
      image: g.image,
    }));
}

function lastTitle(db: Db, p: Person): string | null {
  const row = db
    .select({ t: sql<string>`coalesce(${watchHistory.grandparentTitle}, ${watchHistory.title})` })
    .from(watchHistory)
    .where(eq(watchHistory.plexUserId, p.plexUserId))
    .orderBy(desc(watchHistory.startedAt))
    .limit(1)
    .get();
  return row?.t ?? null;
}

/**
 * Turns queued nudge/warning actions (and goodbyes) into one-delivery runs on the account-notices
 * campaign, so they share the quota guard, idempotency and history with every other email.
 * People who opted out of account notices still get warnings: losing access is something they must hear about.
 */
export function queueLifecycleEmails(db: Db, now = Date.now()): string[] {
  const c = ensureLifecycleCampaign(db, now);
  const server = getSetting(db, 'plex')?.name ?? 'Plex';
  const runIds: string[] = [];
  const queued = db.select().from(lifecycleActions).where(and(eq(lifecycleActions.status, 'queued'), inArray(lifecycleActions.kind, ['nudge', 'warning']))).all();
  for (const a of queued) {
    const p = db.select().from(people).where(eq(people.plexUserId, a.plexUserId)).get();
    if (!p?.email || suppression(db, p.email) || (a.kind === 'nudge' && !topicPreferences(db, p.plexUserId).account)) {
      db.update(lifecycleActions).set({ status: 'cancelled', reason: 'No way to email them', updatedAt: now }).where(eq(lifecycleActions.id, a.id)).run();
      continue;
    }
    const since = idleSince(p) ?? now - 90 * DAY;
    const content: LifecycleContent =
      a.kind === 'nudge'
        ? { type: 'nudge', serverName: server, lastTitle: lastTitle(db, p), lastPlayedAt: p.lastPlayedAt, items: newSince(db, p, since) }
        : { type: 'warning', serverName: server, deadline: a.deadline ?? now + 14 * DAY, lastPlayedAt: p.lastPlayedAt, items: newSince(db, p, since).slice(0, 3) };
    runIds.push(oneOff(db, c.id, `life:${a.id}`, content, p));
    db.update(lifecycleActions).set({ status: 'sent', updatedAt: now }).where(eq(lifecycleActions.id, a.id)).run();
  }
  return runIds;
}

function oneOff(db: Db, campaignId: string, windowKey: string, content: LifecycleContent, p: Person, now = Date.now()): string {
  const runId = newId('run');
  db.transaction((tx) => {
    tx.insert(runs).values({ id: runId, campaignId, windowKey, trigger: 'schedule', status: 'frozen', content: content as unknown as Record<string, unknown>, note: null, createdAt: now, updatedAt: now }).run();
    tx.insert(deliveries).values({ id: newId('dlv'), runId, plexUserId: p.plexUserId, email: normalEmail(p.email!), name: p.displayName, status: 'pending', items: null, createdAt: now }).run();
  });
  return runId;
}

/** Queues a nudge now, from the person page. Skips the rules but not opt-outs or suppressions. */
export function nudgeNow(db: Db, plexUserId: string, actor: string, now = Date.now()): string {
  const p = db.select().from(people).where(eq(people.plexUserId, plexUserId)).get();
  if (!p?.email) throw new Error('No email address for this person.');
  if (suppression(db, p.email)) throw new Error("They've unsubscribed or their address bounced.");
  const a = newAction(db, p, 'nudge', 'queued', `Sent by ${actor}`, now);
  audit(db, { actor, action: 'lifecycle.nudge', target: plexUserId });
  // The worker's lifecycle.send job turns queued notices into emails.
  return a.id;
}

// ---------------------------------------------------------------------------------------------
// Access changes (plex.tv). Each one audited, each one snapshotted where it can be undone.

function shareSnapshot(db: Db, p: Person) {
  const share = db.select().from(plexShares).where(eq(plexShares.plexUserId, p.plexUserId)).get();
  return { username: p.username, email: p.email, displayName: p.displayName, sectionIds: share?.sectionIds ?? [], allLibraries: share?.allLibraries ?? false, allowSync: share?.allowSync ?? false };
}

export function awaitingRemovals(db: Db) {
  return db
    .select({ action: lifecycleActions, person: people })
    .from(lifecycleActions)
    .innerJoin(people, eq(people.plexUserId, lifecycleActions.plexUserId))
    .where(eq(lifecycleActions.status, 'awaiting'))
    .orderBy(lifecycleActions.createdAt)
    .all();
}

/** The owner's decision on a proposed removal (or a removal they started themselves). */
export function decideRemoval(db: Db, input: { actionId?: string; plexUserId?: string; approve: boolean; exempt?: boolean }, actor: string, now = Date.now()): Action {
  let a = input.actionId ? db.select().from(lifecycleActions).where(eq(lifecycleActions.id, input.actionId)).get() : undefined;
  if (!a && input.plexUserId) {
    const p = db.select().from(people).where(eq(people.plexUserId, input.plexUserId)).get();
    if (!p || p.status !== 'shared') throw new Error('Only people with a share can be removed.');
    a = newAction(db, p, 'removal', 'awaiting', `Removed by ${actor}`, now);
  }
  if (!a || a.status !== 'awaiting') throw new Error('This removal was already decided.');
  const status = input.approve ? 'approved' : 'cancelled';
  db.update(lifecycleActions)
    .set({ status, decidedBy: actor, decidedAt: now, reason: input.approve ? a.reason : `Kept by ${actor}`, updatedAt: now })
    .where(eq(lifecycleActions.id, a.id))
    .run();
  if (!input.approve && input.exempt) db.update(people).set({ exempt: true }).where(eq(people.plexUserId, a.plexUserId)).run();
  audit(db, { actor, action: input.approve ? 'lifecycle.removal.approve' : 'lifecycle.removal.keep', target: a.plexUserId, after: { exempt: !!input.exempt } });
  return { ...a, status };
}

/** Carries out an approved removal on plex.tv. Safe to retry: an already-removed friend is treated as done. */
export async function executeRemoval(db: Db, actionId: string, now = Date.now()): Promise<{ goodbye: boolean }> {
  const a = db.select().from(lifecycleActions).where(eq(lifecycleActions.id, actionId)).get();
  if (!a || a.status !== 'approved') return { goodbye: false };
  const p = db.select().from(people).where(eq(people.plexUserId, a.plexUserId)).get();
  const creds = ownerCredentials(db);
  if (!p || !creds) throw new Error('Missing person or owner credentials');
  const snapshot = shareSnapshot(db, p);
  db.update(lifecycleActions).set({ snapshot, updatedAt: now }).where(eq(lifecycleActions.id, a.id)).run();
  try {
    await removeFriend(creds.clientId, creds.token, p.plexUserId);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 404) {
      db.update(lifecycleActions).set({ status: 'failed', error: err instanceof Error ? err.message : String(err), updatedAt: Date.now() }).where(eq(lifecycleActions.id, a.id)).run();
      throw err;
    }
  }
  db.update(lifecycleActions).set({ status: 'done', updatedAt: Date.now() }).where(eq(lifecycleActions.id, a.id)).run();
  db.update(people).set({ status: 'removed', removedAt: Date.now() }).where(eq(people.plexUserId, p.plexUserId)).run();
  db.delete(plexShares).where(eq(plexShares.plexUserId, p.plexUserId)).run();
  audit(db, { actor: a.decidedBy ?? 'playbill', action: 'plex.remove', target: p.plexUserId, before: snapshot });

  const rules = lifecycleRules(db);
  if (rules.sendGoodbye && p.email && !suppression(db, p.email)) {
    const c = ensureLifecycleCampaign(db);
    oneOff(db, c.id, `life:${a.id}:goodbye`, { type: 'goodbye', serverName: getSetting(db, 'plex')?.name ?? 'Plex' }, p);
    return { goodbye: true };
  }
  return { goodbye: false };
}

/** Invites a removed person back with the libraries they had. They'll need to accept again. */
export async function reinvite(db: Db, plexUserId: string, actor: string, now = Date.now()): Promise<void> {
  const p = db.select().from(people).where(eq(people.plexUserId, plexUserId)).get();
  const last = db
    .select()
    .from(lifecycleActions)
    .where(and(eq(lifecycleActions.plexUserId, plexUserId), eq(lifecycleActions.kind, 'removal'), eq(lifecycleActions.status, 'done')))
    .orderBy(desc(lifecycleActions.updatedAt))
    .get();
  const plex = getSetting(db, 'plex');
  const creds = ownerCredentials(db);
  if (!p || !plex || !creds) throw new Error('Missing person or Plex setup');
  const snap = (last?.snapshot ?? {}) as { sectionIds?: string[]; allowSync?: boolean };
  const sections = snap.sectionIds?.length ? snap.sectionIds : [];
  if (sections.length === 0) throw new Error('Playbill has no record of their libraries; invite them from Plex instead.');
  await inviteFriend(creds.clientId, creds.token, plex.machineId, p.email ?? p.username, sections, !!snap.allowSync);
  newAction(db, p, 'reinvite', 'done', `Re-invited by ${actor}`, now, { snapshot: snap as Record<string, unknown> });
  audit(db, { actor, action: 'plex.reinvite', target: plexUserId, after: snap });
}

export async function changeLibraries(db: Db, plexUserId: string, sectionKeys: string[], actor: string, now = Date.now()): Promise<void> {
  const p = db.select().from(people).where(eq(people.plexUserId, plexUserId)).get();
  const share = db.select().from(plexShares).where(eq(plexShares.plexUserId, plexUserId)).get();
  const plex = getSetting(db, 'plex');
  const creds = ownerCredentials(db);
  if (!p || !share?.shareId || !plex || !creds) throw new Error('This person has no share to change.');
  const before = shareSnapshot(db, p);
  await updateShareLibraries(creds.clientId, creds.token, plex.machineId, share.shareId, sectionKeys);
  db.update(plexShares).set({ sectionIds: sectionKeys, allLibraries: false, syncedAt: now }).where(eq(plexShares.plexUserId, plexUserId)).run();
  newAction(db, p, 'libraries', 'done', `Libraries changed by ${actor}`, now, { snapshot: before });
  audit(db, { actor, action: 'plex.libraries', target: plexUserId, before: before.sectionIds, after: sectionKeys });
}

export async function withdrawInvite(db: Db, plexUserId: string, actor: string): Promise<void> {
  if (!plexUserId.startsWith('invite:')) throw new Error('Only invites that haven’t been accepted can be withdrawn here.');
  const creds = ownerCredentials(db);
  if (!creds) throw new Error('Missing owner credentials');
  await cancelInvite(creds.clientId, creds.token, plexUserId.slice('invite:'.length));
  db.delete(people).where(eq(people.plexUserId, plexUserId)).run();
  audit(db, { actor, action: 'plex.invite.cancel', target: plexUserId });
}

export function personActions(db: Db, plexUserId: string): Action[] {
  return db.select().from(lifecycleActions).where(eq(lifecycleActions.plexUserId, plexUserId)).orderBy(desc(lifecycleActions.createdAt)).limit(20).all();
}
