import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { SeerrClient } from './clients/arr';
import { type TautulliClient, recentlyAdded } from './clients/tautulli';
import type { Db } from './db';
import { admins, arrivals, campaigns, deliveries, people, runs, syncState, watchHistory } from './db/schema';
import { newId } from './ids';
import type { ImageRef } from './links';
import { errorMessage, logger } from './log';
import { segmentOf } from './people/segments';
import { normalEmail, suppression } from './topics';
import { preferences } from './db/schema';

const log = logger('arrivals');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const arrivalsSettings = z.object({
  /** Wait this long after the last arrival before sending, so a season pack becomes one email. */
  debounceMinutes: z.number().int().min(15).max(24 * 60),
  /** ...but never hold the first arrival longer than this. */
  maxWaitHours: z.number().int().min(1).max(72),
  /** No sending between these local hours (start inclusive, end exclusive). */
  quietStart: z.number().int().min(0).max(23),
  quietEnd: z.number().int().min(0).max(23),
  /** A person gets at most one arrivals email in this many hours. */
  minHoursBetween: z.number().int().min(1).max(168),
  /** Someone "follows" a show if they watched it within this many days. */
  followDays: z.number().int().min(7).max(1000),
  testAddresses: z.array(z.string().email()).max(10),
  signature: z.string().min(1).max(120),
});
export type ArrivalsSettings = z.infer<typeof arrivalsSettings>;

export function ensureArrivalsCampaign(db: Db, now = Date.now()) {
  const existing = db.select().from(campaigns).where(eq(campaigns.kind, 'arrivals')).get();
  if (existing) return existing;
  const owner = db.select().from(admins).where(eq(admins.role, 'owner')).get();
  const settings: ArrivalsSettings = {
    debounceMinutes: 120,
    maxWaitHours: 24,
    quietStart: 22,
    quietEnd: 9,
    minHoursBetween: 20,
    followDays: 365,
    testAddresses: owner?.email ? [owner.email] : [],
    signature: db.select().from(campaigns).where(eq(campaigns.kind, 'digest')).get()
      ? String((db.select().from(campaigns).where(eq(campaigns.kind, 'digest')).get()!.settings as { signature?: string }).signature ?? 'Plex')
      : 'Plex',
  };
  const row = {
    id: newId('cmp'),
    kind: 'arrivals' as const,
    name: 'New arrivals',
    topic: 'arrivals',
    enabled: false,
    mode: 'test' as const,
    cron: '*/15 * * * *',
    settings,
    lastOccurrence: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(campaigns).values(row).run();
  return db.select().from(campaigns).where(eq(campaigns.id, row.id)).get()!;
}

const plexImage = (p: string | null): ImageRef | null => (p ? { k: 'plex', p, w: 240, h: 360 } : null);

/**
 * Records what's new in Plex. The very first run marks everything already there as backlog, so
 * turning alerts on never mails people about last year's additions.
 */
export async function reconcileArrivals(db: Db, tautulli: TautulliClient, seerr: SeerrClient | null, now = Date.now()): Promise<{ added: number; backlog: boolean }> {
  // The baseline is recorded explicitly, so an empty first answer can't turn the next sync into backlog.
  const first = !db.select().from(syncState).where(eq(syncState.name, 'arrivals')).get();
  const recent = await recentlyAdded(tautulli, 150);
  let added = 0;
  db.transaction((tx) => {
    for (const it of recent) {
      const kind = it.media_type as 'movie' | 'episode' | 'season' | 'show';
      if (!['movie', 'episode', 'season', 'show'].includes(kind)) continue;
      const groupKey = kind === 'episode' ? it.grandparent_rating_key : kind === 'season' ? it.parent_rating_key : it.rating_key;
      const groupTitle = kind === 'episode' ? it.grandparent_title : kind === 'season' ? it.parent_title : it.title;
      if (!groupKey || !groupTitle) continue;
      const thumb = kind === 'episode' ? it.grandparent_thumb : kind === 'season' ? it.parent_thumb : it.thumb;
      const res = tx
        .insert(arrivals)
        .values({
          ratingKey: it.rating_key,
          kind,
          groupKey,
          title: it.title,
          groupTitle,
          season: kind === 'episode' ? it.parent_media_index : kind === 'season' ? it.media_index : null,
          episode: kind === 'episode' ? it.media_index : null,
          year: it.year,
          image: plexImage(thumb) as Record<string, unknown> | null,
          library: it.library_name,
          addedAt: it.added_at * 1000,
          seenAt: now,
          requestedBy: null,
          // Backlog: the first sync, and anything Plex says was added more than 3 days ago.
          alertRunId: first || it.added_at * 1000 < now - 3 * DAY ? 'backlog' : null,
        })
        .onConflictDoNothing()
        .run();
      added += res.changes;
    }
    tx.insert(syncState)
      .values({ name: 'arrivals', cursor: { baseline: true }, lastRunAt: now, lastOkAt: now })
      .onConflictDoUpdate({ target: syncState.name, set: { lastRunAt: now, lastOkAt: now, lastError: null } })
      .run();
  });

  if (seerr) {
    try {
      const filled = await seerr.filledSince(now - 7 * DAY);
      const pending = db.select().from(arrivals).where(isNull(arrivals.alertRunId)).all();
      for (const f of filled) {
        if (!f.requestedByPlexId) continue;
        const t = f.title.toLowerCase();
        for (const a of pending.filter((p) => p.groupTitle.toLowerCase() === t)) {
          const who = new Set(a.requestedBy ?? []);
          who.add(f.requestedByPlexId);
          db.update(arrivals).set({ requestedBy: [...who] }).where(eq(arrivals.ratingKey, a.ratingKey)).run();
        }
      }
    } catch (err) {
      log.warn('could not read Seerr requests', { error: errorMessage(err) });
    }
  }
  return { added, backlog: first };
}

function localHour(ts: number, tz: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(ts)) % 24;
}

export function isQuiet(ts: number, tz: string, start: number, end: number): boolean {
  const h = localHour(ts, tz);
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

/** Pending arrivals if a send is due now (debounce passed, or max wait hit) and it isn't quiet hours. */
export function dueArrivals(db: Db, s: ArrivalsSettings, tz: string, now = Date.now()) {
  const pending = db.select().from(arrivals).where(isNull(arrivals.alertRunId)).all();
  if (pending.length === 0) return null;
  const newest = Math.max(...pending.map((p) => p.seenAt));
  const oldest = Math.min(...pending.map((p) => p.seenAt));
  const due = now - newest >= s.debounceMinutes * 60_000 || now - oldest >= s.maxWaitHours * HOUR;
  if (!due || isQuiet(now, tz, s.quietStart, s.quietEnd)) return null;
  return pending;
}

export interface ArrivalItem {
  key: string;
  kind: 'movie' | 'show';
  title: string;
  detail: string;
  image: ImageRef | null;
  /** Nobody on the server has watched it before: offered to everyone opted in. */
  newSeries: boolean;
}

export interface ArrivalsContent {
  items: ArrivalItem[];
  windowEnd: number;
}

/** Collapses a show's new episodes/seasons into one item: "3 new episodes", "Season 2", "S2 E5". */
export function groupArrivals(rows: (typeof arrivals.$inferSelect)[], followed: Set<string>): ArrivalItem[] {
  const groups = new Map<string, (typeof arrivals.$inferSelect)[]>();
  for (const r of rows) groups.set(r.groupKey, [...(groups.get(r.groupKey) ?? []), r]);
  const out: ArrivalItem[] = [];
  for (const [key, list] of groups) {
    const first = list[0]!;
    if (first.kind === 'movie') {
      out.push({ key, kind: 'movie', title: first.title, detail: first.year ? String(first.year) : 'Film', image: (first.image as ImageRef | null) ?? null, newSeries: false });
      continue;
    }
    const eps = list.filter((r) => r.kind === 'episode');
    const seasons = list.filter((r) => r.kind === 'season');
    let detail: string;
    if (list.some((r) => r.kind === 'show')) detail = 'New series';
    else if (seasons.length === 1 && eps.length === 0) detail = `Season ${seasons[0]!.season}`;
    else if (eps.length === 1) detail = `S${eps[0]!.season} E${eps[0]!.episode}: ${eps[0]!.title}`;
    else detail = `${eps.length + seasons.length} new ${seasons.length ? 'seasons and episodes' : 'episodes'}`;
    out.push({ key, kind: 'show', title: first.groupTitle, detail, image: (first.image as ImageRef | null) ?? null, newSeries: !followed.has(key) });
  }
  return out;
}

/** Who watched which shows recently: show key → people. */
export function followers(db: Db, keys: string[], since: number): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (keys.length === 0) return out;
  const rows = db
    .selectDistinct({ show: watchHistory.grandparentRatingKey, who: watchHistory.plexUserId })
    .from(watchHistory)
    .where(and(inArray(watchHistory.grandparentRatingKey, keys), gte(watchHistory.startedAt, since)))
    .all();
  for (const r of rows) {
    if (!r.show) continue;
    out.set(r.show, (out.get(r.show) ?? new Set()).add(r.who));
  }
  return out;
}

/** Arrivals are opt-out for people who watch; opt-in for everyone else. */
function wantsArrivals(db: Db, p: typeof people.$inferSelect, now: number): boolean {
  const pref = db
    .select()
    .from(preferences)
    .where(and(eq(preferences.plexUserId, p.plexUserId), eq(preferences.topic, 'arrivals')))
    .get();
  if (pref) return pref.subscribed;
  const seg = segmentOf(p, now);
  return seg === 'active' || seg === 'new' || seg === 'owner';
}

export interface PlannedArrivals {
  runId: string;
  recipients: number;
  items: number;
}

/**
 * Freezes pending arrivals into a run and decides, per person, which items they get:
 * new films and brand-new series → everyone who wants arrivals; new episodes → people who follow
 * that show. Requesters are skipped (Seerr told them), as is anyone mailed recently.
 */
export function planArrivals(
  db: Db,
  campaign: typeof campaigns.$inferSelect,
  pending: (typeof arrivals.$inferSelect)[],
  now = Date.now(),
): PlannedArrivals | null {
  const s = arrivalsSettings.parse(campaign.settings);
  const showKeys = [...new Set(pending.filter((p) => p.kind !== 'movie').map((p) => p.groupKey))];
  const fol = followers(db, showKeys, now - s.followDays * DAY);
  const items = groupArrivals(pending, new Set(fol.keys()));
  const requestedBy = new Map<string, Set<string>>();
  for (const p of pending) for (const who of p.requestedBy ?? []) requestedBy.set(p.groupKey, (requestedBy.get(p.groupKey) ?? new Set()).add(who));

  const runId = newId('run');
  const content: ArrivalsContent = { items, windowEnd: now };

  const recentlyMailed = new Set(
    db
      .select({ email: deliveries.email })
      .from(deliveries)
      .innerJoin(runs, eq(runs.id, deliveries.runId))
      .where(and(eq(runs.campaignId, campaign.id), eq(deliveries.status, 'sent'), gte(deliveries.sentAt, now - s.minHoursBetween * HOUR)))
      .all()
      .map((r) => r.email),
  );

  type Plan = { plexUserId: string | null; email: string; name: string; items: string[] };
  const plans: Plan[] = [];
  if (campaign.mode === 'test') {
    for (const email of new Set(s.testAddresses.map(normalEmail))) plans.push({ plexUserId: null, email, name: 'there', items: items.map((i) => i.key) });
  } else {
    const seen = new Set<string>();
    for (const p of db.select().from(people).where(inArray(people.status, ['shared', 'home', 'owner'])).all()) {
      if (!p.email || p.plexUserId.startsWith('invite:')) continue;
      const email = normalEmail(p.email);
      if (seen.has(email) || suppression(db, email) || recentlyMailed.has(email) || !wantsArrivals(db, p, now)) continue;
      seen.add(email);
      const mine = items
        .filter((i) => !requestedBy.get(i.key)?.has(p.plexUserId))
        .filter((i) => i.kind === 'movie' || i.newSeries || fol.get(i.key)?.has(p.plexUserId))
        .map((i) => i.key);
      if (mine.length) plans.push({ plexUserId: p.plexUserId, email, name: p.displayName, items: mine });
    }
  }

  db.transaction((tx) => {
    tx.insert(runs)
      .values({
        id: runId,
        campaignId: campaign.id,
        windowKey: `arrivals:${now}`,
        trigger: 'schedule',
        status: plans.length ? 'frozen' : 'skipped',
        content: content as unknown as Record<string, unknown>,
        note: plans.length ? null : 'Nobody to tell this time',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.update(arrivals)
      .set({ alertRunId: runId })
      .where(inArray(arrivals.ratingKey, pending.map((p) => p.ratingKey)))
      .run();
    for (const pl of plans) {
      tx.insert(deliveries)
        .values({ id: newId('dlv'), runId, plexUserId: pl.plexUserId, email: pl.email, name: pl.name, status: 'pending', items: pl.items, createdAt: now })
        .onConflictDoNothing()
        .run();
    }
  });
  return { runId, recipients: plans.length, items: items.length };
}

export function pendingArrivalsCount(db: Db): number {
  return db.select({ n: sql<number>`count(*)` }).from(arrivals).where(isNull(arrivals.alertRunId)).get()?.n ?? 0;
}

/** A test run from the past week's arrivals, to the test addresses only. Marks nothing as sent. */
export function planTestArrivals(db: Db, campaign: typeof campaigns.$inferSelect, now = Date.now()): PlannedArrivals | null {
  const s = arrivalsSettings.parse(campaign.settings);
  const recent = db.select().from(arrivals).where(gte(arrivals.addedAt, now - 7 * DAY)).all().slice(0, 40);
  if (recent.length === 0 || s.testAddresses.length === 0) return null;
  const items = groupArrivals(recent, new Set()).slice(0, 6);
  const runId = newId('run');
  db.transaction((tx) => {
    tx.insert(runs)
      .values({ id: runId, campaignId: campaign.id, windowKey: `test:${now}`, trigger: 'test', status: 'frozen', content: { items, windowEnd: now } as unknown as Record<string, unknown>, note: null, createdAt: now, updatedAt: now })
      .run();
    for (const email of new Set(s.testAddresses.map(normalEmail))) {
      tx.insert(deliveries).values({ id: newId('dlv'), runId, plexUserId: null, email, name: 'there', status: 'pending', items: items.map((i) => i.key), createdAt: now }).run();
    }
  });
  return { runId, recipients: s.testAddresses.length, items: items.length };
}
