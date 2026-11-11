import { desc, eq, gte } from 'drizzle-orm';
import { type ArrivalItem, type ArrivalsContent, followers, groupArrivals } from './arrivals';
import type { Db } from './db';
import { arrivals, people } from './db/schema';
import { type LeavingContent, leavingList, removalCandidates, watchersOf } from './library';
import { lifecycleContentFor, type LifecycleContent } from './lifecycle';
import type { ImageRef } from './links';
import { buildRecap, type RecapContent } from './recap';

/**
 * Admin previews of every email Playbill sends, for one chosen person, built from live data and
 * never saved or sent. When the real trigger hasn't happened (nothing arrived, nothing is leaving,
 * nobody is idle), a preview falls back to sample content and says so in `note`, so a sample can
 * never be mistaken for what someone is about to receive.
 */

export { isPreviewKind, PREVIEW_KINDS, PREVIEW_LABELS, type PreviewKind } from './preview-kinds';

type Person = typeof people.$inferSelect;
const DAY = 86_400_000;
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;

export interface Preview<T> {
  content: T;
  /** Shown above the preview: why this isn't exactly what the person would get, or what it shows. */
  note: string | null;
  /** Item keys this person would get, when the email lists only theirs. */
  items: string[] | null;
  /** Whose email this is, when it isn't the chosen person (a recap only goes to its own user). */
  recipient?: Person;
}

/** The last week's arrivals as an alert for this person; older arrivals as a sample if the week was quiet. */
export function previewArrivals(db: Db, p: Person | null, followDays: number, now = Date.now()): Preview<ArrivalsContent> | null {
  let rows = db.select().from(arrivals).where(gte(arrivals.addedAt, now - 7 * DAY)).orderBy(desc(arrivals.addedAt)).limit(200).all();
  let note: string | null = null;
  if (rows.length === 0) {
    rows = db.select().from(arrivals).orderBy(desc(arrivals.addedAt)).limit(40).all();
    if (rows.length === 0) return null;
    note = 'Sample: nothing arrived in the last week, so this uses the most recent arrivals.';
  }
  const showKeys = [...new Set(rows.filter((r) => r.kind !== 'movie').map((r) => r.groupKey))];
  const fol = followers(db, showKeys, now - followDays * DAY);
  const all = groupArrivals(rows, new Set(fol.keys()));
  let items: ArrivalItem[] = all;
  if (p) {
    const requested = new Set(rows.filter((r) => (r.requestedBy ?? []).includes(p.plexUserId)).map((r) => r.groupKey));
    const mine = all.filter((i) => !requested.has(i.key) && (i.kind === 'movie' || i.newSeries || fol.get(i.key)?.has(p.plexUserId)));
    if (mine.length > 0) items = mine;
    else note = `${firstName(p.displayName)} wouldn't get an alert for these (requested by them, or episodes of shows they don't watch), so this shows everything that arrived.`;
  }
  items = items.slice(0, 6);
  return { content: { items, windowEnd: now }, note, items: items.map((i) => i.key) };
}

/** Last month's recap for this person, or the busiest watcher's when they watched nothing (named in the note). */
export function previewRecap(db: Db, p: Person | null, tz: string, now = Date.now()): Preview<RecapContent> | null {
  const content = buildRecap(db, now, tz);
  if (p && content.people[p.plexUserId]) return { content, note: null, items: null, recipient: p };
  const busiest = Object.entries(content.people).sort((a, b) => b[1].hours - a[1].hours)[0];
  if (!busiest) return null;
  const other = db.select().from(people).where(eq(people.plexUserId, busiest[0])).get();
  if (!other) return null;
  const who = p ? `${firstName(p.displayName)} watched nothing in ${content.monthLabel}` : 'Nobody was picked';
  return { content, note: `${who}, so this shows ${firstName(other.displayName)}'s recap. Recaps only go to their own person.`, items: null, recipient: other };
}

/** Planned removals this person watched; every planned title, or the stalest titles as a sample, otherwise. */
export function previewLeaving(db: Db, p: Person | null, now = Date.now()): Preview<LeavingContent> | null {
  const planned = leavingList(db);
  if (planned.length > 0) {
    const content: LeavingContent = { items: planned.map((l) => ({ key: l.ratingKey, title: l.title, image: (l.image as ImageRef | null) ?? null, removeAt: l.removeAt })) };
    if (!p) return { content, note: null, items: null };
    const mine = planned.filter((l) => watchersOf(db, l.ratingKey, l.kind).has(p.plexUserId)).map((l) => l.ratingKey);
    if (mine.length > 0) return { content, note: null, items: mine };
    return { content, note: `${firstName(p.displayName)} didn't watch any of these, so they wouldn't get this email. Showing every planned title.`, items: null };
  }
  const c = removalCandidates(db, now);
  const picks = [...c.stale, ...c.never].slice(0, 3);
  if (picks.length === 0) return null;
  const items = picks.map((t, i) => ({ key: t.ratingKey, title: t.year ? `${t.title} (${t.year})` : t.title, image: t.thumb ? ({ k: 'plex', p: t.thumb, w: 240, h: 360 } as const) : null, removeAt: now + (14 + i * 7) * DAY }));
  return { content: { items }, note: 'Sample: nothing is planned to leave. These are titles nobody has watched in a while, with made-up dates.', items: null };
}

/** What a nudge, warning or goodbye to this person would say if it went out today. */
export function previewLifecycle(db: Db, p: Person | null, kind: 'nudge' | 'warning' | 'goodbye', serverName: string, now = Date.now()): Preview<LifecycleContent> | null {
  if (!p) return null;
  const when = { nudge: 'a nudge', warning: 'an access warning', goodbye: 'a goodbye' }[kind];
  return { content: lifecycleContentFor(db, p, kind, serverName, now), note: `What ${firstName(p.displayName)} would get if ${when} went out today.`, items: null };
}
