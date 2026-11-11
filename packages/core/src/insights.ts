import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from './db';
import { leaving, libraries, lifecycleActions, people, plexShares, syncState, watchHistory } from './db/schema';
import { type Segment, segmentOf } from './people/segments';

export const DAY = 86_400_000;
export const WEEK = 7 * DAY;

/** Plain labels for UI copy. Internal ids stay stable. */
export const SEGMENT_LABEL: Record<Segment, string> = {
  owner: 'Owner',
  new: 'New',
  active: 'Active',
  cooling: 'Slowing down',
  dormant: 'Gone quiet',
  inactive: 'Inactive 6+ months',
  never: 'Never watched',
  pending: 'Invite pending',
  removed: 'Removed',
};

/** Order people are listed in when grouped by status. */
export const SEGMENT_ORDER: Segment[] = ['active', 'new', 'cooling', 'dormant', 'inactive', 'never', 'pending', 'removed', 'owner'];

/**
 * A week's mark in the register: 0 = didn't watch, 1–4 = watched, by hours.
 * Bins: < 1 h, 1–3 h, 3–8 h, 8 h+.
 */
export function markLevel(seconds: number): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0) return 0;
  const h = seconds / 3600;
  if (h < 1) return 1;
  if (h < 3) return 2;
  if (h < 8) return 3;
  return 4;
}

export interface WeekCell {
  /** 0 = the most recent 7 days. */
  index: number;
  start: number;
  end: number;
  plays: number;
  seconds: number;
  level: 0 | 1 | 2 | 3 | 4;
  topTitle: string | null;
}

/** Rolling 7-day windows ending at `now`, oldest first. */
export function weekWindows(now: number, count: number): { index: number; start: number; end: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const index = count - 1 - i;
    return { index, start: now - (index + 1) * WEEK, end: now - index * WEEK };
  });
}

/** Per-person weekly marks for the last `weeks` weeks, oldest first. */
export function weeklyMarks(db: Db, personIds: string[], now: number, weeks: number): Map<string, WeekCell[]> {
  const out = new Map<string, WeekCell[]>();
  if (personIds.length === 0) return out;
  const since = now - weeks * WEEK;
  const rows = db
    .select({
      id: watchHistory.plexUserId,
      w: sql<number>`cast((${now} - ${watchHistory.startedAt}) / ${WEEK} as integer)`,
      plays: sql<number>`count(*)`,
      seconds: sql<number>`sum(${watchHistory.playSeconds})`,
    })
    .from(watchHistory)
    .where(and(inArray(watchHistory.plexUserId, personIds), gte(watchHistory.startedAt, since), sql`${watchHistory.startedAt} < ${now}`))
    .groupBy(watchHistory.plexUserId, sql`2`)
    .all();
  // Most-watched title per person-week (by time), for the hover card.
  const titleRows = db
    .select({
      id: watchHistory.plexUserId,
      w: sql<number>`cast((${now} - ${watchHistory.startedAt}) / ${WEEK} as integer)`,
      title: sql<string>`coalesce(${watchHistory.grandparentTitle}, ${watchHistory.title})`,
      seconds: sql<number>`sum(${watchHistory.playSeconds})`,
    })
    .from(watchHistory)
    .where(and(inArray(watchHistory.plexUserId, personIds), gte(watchHistory.startedAt, since), sql`${watchHistory.startedAt} < ${now}`))
    .groupBy(watchHistory.plexUserId, sql`2`, sql`3`)
    .all();
  const top = new Map<string, { title: string; seconds: number }>();
  for (const t of titleRows) {
    const key = `${t.id}:${t.w}`;
    const cur = top.get(key);
    if (!cur || t.seconds > cur.seconds) top.set(key, { title: t.title, seconds: t.seconds });
  }
  const windows = weekWindows(now, weeks);
  for (const id of personIds) {
    out.set(
      id,
      windows.map((w) => ({ ...w, plays: 0, seconds: 0, level: 0, topTitle: null })),
    );
  }
  for (const r of rows) {
    const cells = out.get(r.id);
    const cell = cells?.[weeks - 1 - r.w];
    if (!cell) continue;
    cell.plays = r.plays;
    cell.seconds = r.seconds ?? 0;
    cell.level = markLevel(cell.seconds);
    cell.topTitle = top.get(`${r.id}:${r.w}`)?.title ?? null;
  }
  return out;
}

export interface PersonRow {
  id: string;
  displayName: string;
  username: string;
  email: string | null;
  thumb: string | null;
  status: (typeof people.$inferSelect)['status'];
  segment: Segment;
  exempt: boolean;
  note: string | null;
  since: number | null;
  /** When they actually joined (accepted, else invited). Null when unknown; never Playbill's own sync date. */
  joinedAt: number | null;
  lastPlayedAt: number | null;
  daysSinceLastPlay: number | null;
  lastTitle: string | null;
  plays: number;
  hours: number;
  devices: number;
  libraries: string;
}

function lastTitles(db: Db): Map<string, string> {
  const rows = db.all<{ id: string; title: string }>(sql`
    select h.plex_user_id as id, coalesce(h.grandparent_title, h.title) as title
      from watch_history h
      join (select plex_user_id, max(started_at) m from watch_history group by plex_user_id) x
        on x.plex_user_id = h.plex_user_id and x.m = h.started_at`);
  return new Map(rows.map((r) => [r.id, r.title]));
}

function libraryLabels(db: Db): Map<string, string> {
  const names = new Map(db.select().from(libraries).all().map((l) => [l.sectionId, l.name]));
  const shares = db.select().from(plexShares).all();
  return new Map(
    shares.map((s) => [
      s.plexUserId,
      s.allLibraries ? 'All libraries' : s.sectionIds.map((id) => names.get(id) ?? `#${id}`).join(', ') || 'None',
    ]),
  );
}

/** Everyone, with their segment and headline numbers. Owner and invite-only rows included. */
export function listPeople(db: Db, now: number): PersonRow[] {
  const totals = new Map(
    db
      .select({
        id: watchHistory.plexUserId,
        plays: sql<number>`count(*)`,
        seconds: sql<number>`sum(${watchHistory.playSeconds})`,
        devices: sql<number>`count(distinct case when ${watchHistory.startedAt} >= ${now - 180 * DAY} then coalesce(${watchHistory.player}, '') || '|' || coalesce(${watchHistory.platform}, '') end)`,
      })
      .from(watchHistory)
      .groupBy(watchHistory.plexUserId)
      .all()
      .map((t) => [t.id, t]),
  );
  const titles = lastTitles(db);
  const libs = libraryLabels(db);
  return db
    .select()
    .from(people)
    .all()
    .map((p) => {
      const t = totals.get(p.plexUserId);
      const segment = segmentOf(p, now);
      return {
        id: p.plexUserId,
        displayName: p.displayName,
        username: p.username,
        email: p.email,
        thumb: p.thumb,
        status: p.status,
        segment,
        exempt: p.exempt,
        note: p.note,
        since: p.acceptedAt ?? p.invitedAt ?? p.firstSeenAt,
        joinedAt: p.acceptedAt ?? p.invitedAt,
        lastPlayedAt: p.lastPlayedAt,
        daysSinceLastPlay: p.lastPlayedAt === null ? null : Math.floor((now - p.lastPlayedAt) / DAY),
        lastTitle: titles.get(p.plexUserId) ?? null,
        plays: t?.plays ?? 0,
        hours: Math.round(((t?.seconds ?? 0) / 3600) * 10) / 10,
        devices: t?.devices ?? 0,
        libraries: p.status === 'owner' ? 'Owner' : (libs.get(p.plexUserId) ?? (p.status === 'home' ? 'Plex Home' : '—')),
      };
    });
}

/** People who count as "your audience": have access and aren't you. */
export function isAudience(p: Pick<PersonRow, 'status'>): boolean {
  return p.status === 'shared' || p.status === 'home';
}

export interface HousekeepingItem {
  id: string;
  /** Plain sentence shown to the owner. */
  text: string;
  count: number;
  action: { label: string; href: string };
  /** Needs a decision from the owner (rendered in the reserved red). */
  decision: boolean;
}

export interface Overview {
  rangeDays: number;
  audience: number;
  watched: number;
  watchedBefore: number;
  plays: number;
  hours: number;
  busiest: { weekday: number; hour: number } | null;
  /** Distinct audience members who watched, per week, oldest first (12 weeks). */
  weeklyActive: { start: number; end: number; count: number }[];
  housekeeping: HousekeepingItem[];
  attention: PersonRow[];
  lastSyncAt: number | null;
}

function zonedParts(tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return (ts: number) => {
    let weekday = 0;
    let hour = 0;
    for (const part of fmt.formatToParts(ts)) {
      if (part.type === 'weekday') weekday = WD[part.value] ?? 0;
      if (part.type === 'hour') hour = Number(part.value) % 24;
    }
    return { weekday, hour };
  };
}

/** Plays per weekday (Mon = 0) × hour in the owner's timezone, over the last `days`. */
export function peakHours(db: Db, now: number, days: number, tz: string): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const parts = zonedParts(tz);
  const rows = db
    .select({ t: watchHistory.startedAt })
    .from(watchHistory)
    .where(gte(watchHistory.startedAt, now - days * DAY))
    .all();
  for (const r of rows) {
    const { weekday, hour } = parts(r.t);
    grid[weekday]![hour]!++;
  }
  return grid;
}

/** Plays and hours per rolling week, oldest first. */
export function weeklyTotals(db: Db, now: number, weeks: number) {
  const since = now - weeks * WEEK;
  const rows = db
    .select({
      w: sql<number>`cast((${now} - ${watchHistory.startedAt}) / ${WEEK} as integer)`,
      plays: sql<number>`count(*)`,
      seconds: sql<number>`sum(${watchHistory.playSeconds})`,
      people: sql<number>`count(distinct ${watchHistory.plexUserId})`,
    })
    .from(watchHistory)
    .where(and(gte(watchHistory.startedAt, since), sql`${watchHistory.startedAt} < ${now}`))
    .groupBy(sql`1`)
    .all();
  return weekWindows(now, weeks).map((w) => {
    const r = rows.find((x) => x.w === w.index);
    return { ...w, plays: r?.plays ?? 0, hours: Math.round(((r?.seconds ?? 0) / 3600) * 10) / 10, people: r?.people ?? 0 };
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function overview(db: Db, now: number, rangeDays: number, tz: string): Overview {
  const all = listPeople(db, now);
  const audience = all.filter(isAudience);
  const audienceIds = new Set(audience.map((p) => p.id));
  const range = rangeDays * DAY;

  const watchersIn = (from: number, to: number) =>
    new Set(
      db
        .selectDistinct({ id: watchHistory.plexUserId })
        .from(watchHistory)
        .where(and(gte(watchHistory.startedAt, from), sql`${watchHistory.startedAt} < ${to}`))
        .all()
        .map((r) => r.id)
        .filter((id) => audienceIds.has(id)),
    );
  const watched = watchersIn(now - range, now).size;
  const watchedBefore = watchersIn(now - 2 * range, now - range).size;

  const totals = db
    .select({ plays: sql<number>`count(*)`, seconds: sql<number>`coalesce(sum(${watchHistory.playSeconds}), 0)` })
    .from(watchHistory)
    .where(gte(watchHistory.startedAt, now - range))
    .get();

  const grid = peakHours(db, now, rangeDays, tz);
  let busiest: Overview['busiest'] = null;
  let max = 0;
  grid.forEach((row, weekday) =>
    row.forEach((n, hour) => {
      if (n > max) {
        max = n;
        busiest = { weekday, hour };
      }
    }),
  );

  const weeklyActive = weekWindows(now, 12).map((w) => ({ start: w.start, end: w.end, count: watchersIn(w.start, w.end).size }));

  const by = (s: Segment) => all.filter((p) => p.segment === s && !p.exempt);
  const pending = all.filter((p) => p.segment === 'pending');
  const inactive = by('inactive');
  const dormant = by('dormant');
  const never = by('never');
  const cooling = by('cooling');

  const housekeeping: HousekeepingItem[] = [];
  const sync = db.select().from(syncState).where(eq(syncState.name, 'history')).get();
  if (sync?.lastError && (!sync.lastOkAt || (sync.lastRunAt ?? 0) > sync.lastOkAt)) {
    housekeeping.push({
      id: 'sync',
      text: `Watch history stopped syncing: ${sync.lastError}`,
      count: 1,
      action: { label: 'Check Tautulli', href: '/settings' },
      decision: true,
    });
  }
  const removeToday = db
    .select({ n: sql<number>`count(*)` })
    .from(leaving)
    .where(and(inArray(leaving.status, ['planned', 'notified']), sql`${leaving.removeAt} <= ${now}`))
    .get()?.n ?? 0;
  if (removeToday)
    housekeeping.push({
      id: 'leaving',
      text: `${plural(removeToday, 'title is', 'titles are')} due to be removed. Delete ${removeToday === 1 ? 'it' : 'them'} in Radarr or Sonarr, then mark ${removeToday === 1 ? 'it' : 'them'} done.`,
      count: removeToday,
      action: { label: 'See titles', href: '/library' },
      decision: true,
    });
  const awaiting = db.select({ n: sql<number>`count(*)` }).from(lifecycleActions).where(eq(lifecycleActions.status, 'awaiting')).get()?.n ?? 0;
  if (awaiting)
    housekeeping.push({
      id: 'approvals',
      text: `${plural(awaiting, 'removal is', 'removals are')} waiting for your approval.`,
      count: awaiting,
      action: { label: 'Decide', href: '/people#approvals' },
      decision: true,
    });
  if (inactive.length)
    housekeeping.push({
      id: 'inactive',
      text: `${plural(inactive.length, "person hasn't", "people haven't")} watched anything in over 6 months.`,
      count: inactive.length,
      action: { label: 'Review', href: '/people?status=inactive' },
      decision: true,
    });
  if (pending.length) {
    const oldest = Math.max(...pending.map((p) => (p.since ? Math.floor((now - p.since) / DAY) : 0)));
    housekeeping.push({
      id: 'pending',
      text:
        pending.length === 1
          ? `1 invite hasn't been accepted (${oldest} days).`
          : `${pending.length} invites haven't been accepted (oldest ${oldest} days).`,
      count: pending.length,
      action: { label: 'See invites', href: '/people?status=pending' },
      decision: false,
    });
  }
  if (dormant.length)
    housekeeping.push({
      id: 'dormant',
      text: `${plural(dormant.length, 'person has', 'people have')} gone quiet (3–6 months without watching).`,
      count: dormant.length,
      action: { label: 'See who', href: '/people?status=dormant' },
      decision: false,
    });
  if (never.length)
    housekeeping.push({
      id: 'never',
      text: `${plural(never.length, 'person has', 'people have')} never watched anything.`,
      count: never.length,
      action: { label: 'See who', href: '/people?status=never' },
      decision: false,
    });
  if (cooling.length)
    housekeeping.push({
      id: 'cooling',
      text: `${plural(cooling.length, 'person is', 'people are')} slowing down (1–3 months since they last watched).`,
      count: cooling.length,
      action: { label: 'See who', href: '/people?status=cooling' },
      decision: false,
    });

  // Who needs attention: most recently slipped first, so the register reads as "what changed".
  const rank: Partial<Record<Segment, number>> = { cooling: 0, dormant: 1, inactive: 2, never: 3 };
  const attention = all
    .filter((p) => isAudience(p) && rank[p.segment] !== undefined)
    .sort((a, b) => rank[a.segment]! - rank[b.segment]! || (a.daysSinceLastPlay ?? 1e9) - (b.daysSinceLastPlay ?? 1e9));

  const lastSync = db.select({ at: syncState.lastOkAt }).from(syncState).where(eq(syncState.name, 'history')).get();

  return {
    rangeDays,
    audience: audience.length,
    watched,
    watchedBefore,
    plays: totals?.plays ?? 0,
    hours: Math.round((totals?.seconds ?? 0) / 360) / 10,
    busiest,
    weeklyActive,
    housekeeping,
    attention,
    lastSyncAt: lastSync?.at ?? null,
  };
}

export interface PersonDetail {
  person: PersonRow;
  invitedAt: number | null;
  acceptedAt: number | null;
  plexLastSeenAt: number | null;
  recent: (typeof watchHistory.$inferSelect)[];
  devices: { player: string; platform: string; plays: number; lastAt: number }[];
  topTitles: { title: string; plays: number; hours: number }[];
}

export function personDetail(db: Db, id: string, now: number): PersonDetail | null {
  const row = db.select().from(people).where(eq(people.plexUserId, id)).get();
  if (!row) return null;
  const person = listPeople(db, now).find((p) => p.id === id)!;
  const recent = db
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.plexUserId, id))
    .orderBy(desc(watchHistory.startedAt))
    .limit(25)
    .all();
  const devices = db
    .select({
      player: sql<string>`coalesce(${watchHistory.player}, 'Unknown')`,
      platform: sql<string>`coalesce(${watchHistory.platform}, '')`,
      plays: sql<number>`count(*)`,
      lastAt: sql<number>`max(${watchHistory.startedAt})`,
    })
    .from(watchHistory)
    .where(eq(watchHistory.plexUserId, id))
    .groupBy(sql`1`, sql`2`)
    .orderBy(sql`4 desc`)
    .limit(8)
    .all();
  const topTitles = db
    .select({
      title: sql<string>`coalesce(${watchHistory.grandparentTitle}, ${watchHistory.title})`,
      plays: sql<number>`count(*)`,
      hours: sql<number>`round(sum(${watchHistory.playSeconds}) / 3600.0, 1)`,
    })
    .from(watchHistory)
    .where(eq(watchHistory.plexUserId, id))
    .groupBy(sql`1`)
    .orderBy(sql`3 desc`)
    .limit(6)
    .all();
  return {
    person,
    invitedAt: row.invitedAt,
    acceptedAt: row.acceptedAt,
    plexLastSeenAt: row.plexLastSeenAt,
    recent,
    devices,
    topTitles,
  };
}
