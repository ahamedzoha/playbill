import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from './audit';
import type { TautulliClient } from './clients/tautulli';
import type { Db } from './db';
import { admins, campaigns, deliveries, leaving, libraries, libraryItems, people, runs, watchHistory } from './db/schema';
import { newId } from './ids';
import type { ImageRef } from './links';
import { getSetting } from './settings';
import { normalEmail, suppression, topicPreferences } from './topics';

const DAY = 86_400_000;

const num = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().nullable());
const mediaRow = z
  .object({
    rating_key: z.coerce.string(),
    title: z.coerce.string(),
    year: num,
    thumb: z.string().nullable().optional(),
    added_at: num,
    last_played: num,
    play_count: num,
    file_size: num,
    media_type: z.coerce.string(),
  })
  .loose();

/** Refreshes the library list (films and shows) with play counts and sizes. */
export async function syncLibrary(db: Db, tautulli: TautulliClient, now = Date.now()): Promise<number> {
  const sections = db.select().from(libraries).all().filter((l) => l.active && (l.type === 'movie' || l.type === 'show'));
  let total = 0;
  for (const s of sections) {
    const data = await tautulli.call('get_library_media_info', { section_id: s.sectionId, length: 10_000, order_column: 'sort_title', refresh: 'false' }, z.object({ data: z.array(mediaRow) }).loose());
    db.transaction((tx) => {
      for (const r of data.data) {
        const row = {
          ratingKey: r.rating_key,
          sectionId: s.sectionId,
          kind: r.media_type,
          title: r.title,
          year: r.year,
          thumb: r.thumb ?? null,
          addedAt: r.added_at ? r.added_at * 1000 : null,
          lastPlayedAt: r.last_played ? r.last_played * 1000 : null,
          plays: r.play_count ?? 0,
          bytes: r.file_size,
          syncedAt: now,
        };
        tx.insert(libraryItems).values(row).onConflictDoUpdate({ target: libraryItems.ratingKey, set: row }).run();
      }
      // Titles deleted from Plex since the last sync.
      tx.delete(libraryItems).where(and(eq(libraryItems.sectionId, s.sectionId), lt(libraryItems.syncedAt, now))).run();
    });
    total += data.data.length;
  }
  return total;
}

export interface Candidate {
  ratingKey: string;
  title: string;
  year: number | null;
  library: string;
  kind: string;
  addedAt: number | null;
  lastPlayedAt: number | null;
  plays: number;
  bytes: number | null;
  thumb: string | null;
  leavingAt: number | null;
}

/** Titles nobody has watched: never played (and added over 90 days ago), or not played in a year. */
export function removalCandidates(db: Db, now = Date.now()) {
  const names = new Map(db.select().from(libraries).all().map((l) => [l.sectionId, l.name]));
  const planned = new Map(db.select().from(leaving).where(inArray(leaving.status, ['planned', 'notified'])).all().map((l) => [l.ratingKey, l.removeAt]));
  const rows = db
    .select()
    .from(libraryItems)
    .where(or(and(isNull(libraryItems.lastPlayedAt), lt(libraryItems.addedAt, now - 90 * DAY)), lt(libraryItems.lastPlayedAt, now - 365 * DAY)))
    .orderBy(desc(libraryItems.bytes))
    .all();
  const toCandidate = (r: (typeof rows)[number]): Candidate => ({
    ratingKey: r.ratingKey,
    title: r.title,
    year: r.year,
    library: names.get(r.sectionId) ?? '',
    kind: r.kind,
    addedAt: r.addedAt,
    lastPlayedAt: r.lastPlayedAt,
    plays: r.plays,
    bytes: r.bytes,
    thumb: r.thumb,
    leavingAt: planned.get(r.ratingKey) ?? null,
  });
  const never = rows.filter((r) => r.lastPlayedAt === null).map(toCandidate);
  const stale = rows.filter((r) => r.lastPlayedAt !== null).map(toCandidate);
  const bytes = (list: Candidate[]) => list.reduce((s, c) => s + (c.bytes ?? 0), 0);
  return { never, stale, neverBytes: bytes(never), staleBytes: bytes(stale) };
}

/** Plans removals. Playbill only notifies and reminds; deleting is done in Radarr/Sonarr or Plex. */
export function planLeaving(db: Db, ratingKeys: string[], removeAt: number, noticeDays: number, actor: string, now = Date.now()): number {
  const items = db.select().from(libraryItems).where(inArray(libraryItems.ratingKey, ratingKeys)).all();
  for (const it of items) {
    const row = {
      ratingKey: it.ratingKey,
      title: it.year ? `${it.title} (${it.year})` : it.title,
      kind: it.kind,
      image: (it.thumb ? { k: 'plex', p: it.thumb, w: 240, h: 360 } : null) as Record<string, unknown> | null,
      removeAt,
      noticeDays,
      status: 'planned' as const,
      runId: null,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
    };
    const { createdAt: _created, ...update } = row;
    db.insert(leaving).values(row).onConflictDoUpdate({ target: leaving.ratingKey, set: update }).run();
  }
  audit(db, { actor, action: 'library.leaving.plan', after: { titles: items.map((i) => i.title), removeAt, noticeDays } });
  return items.length;
}

export function setLeavingStatus(db: Db, ratingKey: string, status: 'removed' | 'cancelled', actor: string): void {
  db.update(leaving).set({ status, updatedAt: Date.now() }).where(eq(leaving.ratingKey, ratingKey)).run();
  audit(db, { actor, action: `library.leaving.${status}`, target: ratingKey });
}

export function leavingList(db: Db) {
  return db.select().from(leaving).where(inArray(leaving.status, ['planned', 'notified'])).orderBy(leaving.removeAt).all();
}

/** People who watched or started a title (a film, or any episode of a show). */
export function watchersOf(db: Db, ratingKey: string, kind: string): Set<string> {
  const col = kind === 'show' ? watchHistory.grandparentRatingKey : watchHistory.ratingKey;
  return new Set(db.selectDistinct({ id: watchHistory.plexUserId }).from(watchHistory).where(eq(col, ratingKey)).all().map((r) => r.id));
}

export function ensureLeavingCampaign(db: Db, now = Date.now()) {
  const existing = db.select().from(campaigns).where(eq(campaigns.kind, 'leaving')).get();
  if (existing) return existing;
  const owner = db.select().from(admins).where(eq(admins.role, 'owner')).get();
  const digest = db.select().from(campaigns).where(eq(campaigns.kind, 'digest')).get();
  const row = {
    id: newId('cmp'),
    kind: 'leaving' as const,
    name: 'Leaving soon',
    topic: 'leaving',
    enabled: true,
    mode: 'live' as const,
    cron: '30 11 * * *',
    settings: { signature: String((digest?.settings as { signature?: string } | undefined)?.signature ?? getSetting(db, 'plex')?.name ?? 'Plex'), testAddresses: owner?.email ? [owner.email] : [] },
    lastOccurrence: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(campaigns).values(row).run();
  return db.select().from(campaigns).where(eq(campaigns.id, row.id)).get()!;
}

export interface LeavingContent {
  items: { key: string; title: string; image: ImageRef | null; removeAt: number }[];
}

/**
 * Daily: titles whose notice window has opened get one email per person who watched any of them,
 * listing only theirs. Each title is announced once.
 */
export function planLeavingNotices(db: Db, now = Date.now()): string | null {
  const due = db.select().from(leaving).where(and(eq(leaving.status, 'planned'), lte(sql`${leaving.removeAt} - ${leaving.noticeDays} * ${DAY}`, now))).all();
  if (due.length === 0) return null;
  const c = ensureLeavingCampaign(db, now);
  const content: LeavingContent = { items: due.map((d) => ({ key: d.ratingKey, title: d.title, image: (d.image as ImageRef | null) ?? null, removeAt: d.removeAt })) };
  const perPerson = new Map<string, string[]>();
  for (const d of due) for (const id of watchersOf(db, d.ratingKey, d.kind)) perPerson.set(id, [...(perPerson.get(id) ?? []), d.ratingKey]);
  const runId = newId('run');
  const everyone = new Map(db.select().from(people).all().map((p) => [p.plexUserId, p]));
  db.transaction((tx) => {
    tx.insert(runs).values({ id: runId, campaignId: c.id, windowKey: `leaving:${now}`, trigger: 'schedule', status: 'frozen', content: content as unknown as Record<string, unknown>, note: null, createdAt: now, updatedAt: now }).run();
    const seen = new Set<string>();
    for (const [id, keys] of perPerson) {
      const p = everyone.get(id);
      if (!p?.email || !['shared', 'home', 'owner'].includes(p.status)) continue;
      const email = normalEmail(p.email);
      if (seen.has(email) || suppression(db, email) || !topicPreferences(db, id).leaving) continue;
      seen.add(email);
      tx.insert(deliveries).values({ id: newId('dlv'), runId, plexUserId: id, email, name: p.displayName, status: 'pending', items: keys, createdAt: now }).run();
    }
    tx.update(leaving).set({ status: 'notified', runId, updatedAt: now }).where(inArray(leaving.ratingKey, due.map((d) => d.ratingKey))).run();
  });
  return runId;
}

/** Planned removals whose date has come: shown to the owner as a reminder. */
export function dueRemovals(db: Db, now = Date.now()) {
  return db.select().from(leaving).where(and(inArray(leaving.status, ['planned', 'notified']), lte(leaving.removeAt, now))).all();
}
