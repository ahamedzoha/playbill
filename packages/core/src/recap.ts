import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from './db';
import { admins, campaigns, people, watchHistory } from './db/schema';
import { newId } from './ids';
import { getSetting } from './settings';
import type { ImageRef } from './links';
import { normalEmail, suppression, topicPreferences } from './topics';

export interface PersonRecap {
  name: string;
  hours: number;
  plays: number;
  activeDays: number;
  previousHours: number;
  /** `image` is missing on recaps frozen before posters were added. */
  top: { title: string; hours: number; image?: ImageRef | null }[];
  /** Weekday (0 = Monday) they watched most. */
  favouriteDay: number | null;
  /** Started last month and not finished: a nudge to go back. */
  unfinished: { title: string; percent: number }[];
}

export interface RecapContent {
  monthStart: number;
  monthEnd: number;
  monthLabel: string;
  people: Record<string, PersonRecap>;
}

export const DEFAULT_RECAP_CRON = '0 10 1 * *';

export function ensureRecapCampaign(db: Db, now = Date.now()) {
  const existing = db.select().from(campaigns).where(eq(campaigns.kind, 'recap')).get();
  if (existing) return existing;
  const owner = db.select().from(admins).where(eq(admins.role, 'owner')).get();
  const digest = db.select().from(campaigns).where(eq(campaigns.kind, 'digest')).get();
  const row = {
    id: newId('cmp'),
    kind: 'recap' as const,
    name: 'Monthly recap',
    topic: 'recap',
    enabled: false,
    mode: 'test' as const,
    cron: DEFAULT_RECAP_CRON,
    settings: {
      signature: String((digest?.settings as { signature?: string } | undefined)?.signature ?? getSetting(db, 'plex')?.name ?? 'Plex'),
      testAddresses: owner?.email ? [owner.email] : [],
    },
    lastOccurrence: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(campaigns).values(row).run();
  return db.select().from(campaigns).where(eq(campaigns.id, row.id)).get()!;
}

/** The calendar month before `now`, in the owner's timezone. */
export function previousMonth(now: number, tz: string): { start: number; end: number; label: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric' }).formatToParts(now).map((p) => [p.type, p.value]));
  const y = Number(parts.year);
  const m = Number(parts.month); // 1-12, the current month
  // Offset of the timezone at a given instant, in ms.
  const offset = (ts: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
        .formatToParts(ts)
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second)) - ts;
  };
  const localMidnight = (yy: number, mm: number) => {
    const guess = Date.UTC(yy, mm - 1, 1);
    return guess - offset(guess);
  };
  const end = localMidnight(y, m);
  const start = m === 1 ? localMidnight(y - 1, 12) : localMidnight(y, m - 1);
  const label = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: tz }).format(start + 86_400_000);
  return { start, end, label };
}

function weekday(ts: number, tz: string): number {
  const d = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(ts);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(d);
}

function dayKey(ts: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(ts);
}

/** Everyone's month, computed once and frozen into the run. Only people who watched get a recap. */
export function buildRecap(db: Db, now: number, tz: string): RecapContent {
  const { start, end, label } = previousMonth(now, tz);
  const prevStart = previousMonth(start + 3_600_000, tz).start;
  const rows = db.select().from(watchHistory).where(and(gte(watchHistory.startedAt, start), lt(watchHistory.startedAt, end))).all();
  const prev = new Map(
    db
      .select({ id: watchHistory.plexUserId, s: sql<number>`sum(${watchHistory.playSeconds})` })
      .from(watchHistory)
      .where(and(gte(watchHistory.startedAt, prevStart), lt(watchHistory.startedAt, start)))
      .groupBy(watchHistory.plexUserId)
      .all()
      .map((r) => [r.id, r.s]),
  );
  const byPerson = new Map<string, typeof rows>();
  for (const r of rows) byPerson.set(r.plexUserId, [...(byPerson.get(r.plexUserId) ?? []), r]);
  const names = new Map(db.select({ id: people.plexUserId, name: people.displayName }).from(people).all().map((p) => [p.id, p.name]));

  const out: RecapContent = { monthStart: start, monthEnd: end, monthLabel: label, people: {} };
  for (const [id, list] of byPerson) {
    const seconds = list.reduce((s, r) => s + r.playSeconds, 0);
    if (seconds < 300) continue;
    const titles = new Map<string, number>();
    const posters = new Map<string, string>();
    const days = new Set<string>();
    const wd = Array<number>(7).fill(0);
    for (const r of list) {
      const t = r.grandparentTitle ?? r.title;
      titles.set(t, (titles.get(t) ?? 0) + r.playSeconds);
      // The show's poster for episodes, the film's own otherwise.
      const key = r.grandparentRatingKey ?? r.ratingKey;
      if (key && !posters.has(t)) posters.set(t, key);
      days.add(dayKey(r.startedAt, tz));
      wd[weekday(r.startedAt, tz)]! += r.playSeconds;
    }
    const unfinished = new Map<string, number>();
    for (const r of list.filter((r) => r.mediaType === 'movie' && (r.percentComplete ?? 100) >= 10 && (r.percentComplete ?? 100) < 85)) {
      const finished = list.some((x) => x.ratingKey === r.ratingKey && (x.percentComplete ?? 0) >= 85);
      if (!finished) unfinished.set(r.title, Math.max(unfinished.get(r.title) ?? 0, r.percentComplete ?? 0));
    }
    const best = wd.indexOf(Math.max(...wd));
    out.people[id] = {
      name: names.get(id) ?? 'there',
      hours: Math.round((seconds / 3600) * 10) / 10,
      plays: list.length,
      activeDays: days.size,
      previousHours: Math.round(((prev.get(id) ?? 0) / 3600) * 10) / 10,
      top: [...titles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([title, s]) => {
        const key = posters.get(title);
        return { title, hours: Math.round((s / 3600) * 10) / 10, image: key ? ({ k: 'plex', p: `/library/metadata/${key}/thumb`, w: 240, h: 360 } as const) : null };
      }),
      favouriteDay: wd[best]! > 0 ? best : null,
      unfinished: [...unfinished.entries()].slice(0, 2).map(([title, percent]) => ({ title, percent })),
    };
  }
  return out;
}

/** Who gets this month's recap: watched something, wants recaps, has a working address. */
export function recapRecipients(db: Db, content: RecapContent) {
  const ids = Object.keys(content.people);
  if (ids.length === 0) return [];
  const seen = new Set<string>();
  return db
    .select()
    .from(people)
    .where(inArray(people.plexUserId, ids))
    .all()
    .filter((p) => {
      if (!p.email || !['shared', 'home', 'owner'].includes(p.status)) return false;
      const e = normalEmail(p.email);
      if (seen.has(e) || suppression(db, e) || !topicPreferences(db, p.plexUserId).recap) return false;
      seen.add(e);
      return true;
    })
    .map((p) => ({ plexUserId: p.plexUserId, email: normalEmail(p.email!), name: p.displayName }));
}
