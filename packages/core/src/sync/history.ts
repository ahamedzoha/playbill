import { eq, sql } from 'drizzle-orm';
import type { TautulliHistoryRow, TautulliReader } from '../clients/tautulli';
import type { Db } from '../db';
import { libraries, syncState, watchHistory } from '../db/schema';

const PAGE = 1000;
const STATE = 'history';

interface Cursor {
  backfillDone: boolean;
  /** Next offset per section while backfilling ('' = rows outside any current library). */
  offsets: Record<string, number>;
  done: Record<string, boolean>;
}

function readCursor(db: Db): Cursor {
  const row = db.select().from(syncState).where(eq(syncState.name, STATE)).get();
  const c = (row?.cursor ?? {}) as Partial<Cursor>;
  return { backfillDone: !!c.backfillDone, offsets: c.offsets ?? {}, done: c.done ?? {} };
}

function writeCursor(db: Db, cursor: Cursor, extra: { ok?: boolean; error?: string } = {}): void {
  const now = Date.now();
  const set = {
    cursor: cursor as unknown as Record<string, unknown>,
    lastRunAt: now,
    ...(extra.ok ? { lastOkAt: now, lastError: null } : {}),
    ...(extra.error ? { lastError: extra.error } : {}),
  };
  db.insert(syncState)
    .values({ name: STATE, ...set })
    .onConflictDoUpdate({ target: syncState.name, set })
    .run();
}

export function toHistoryRow(r: TautulliHistoryRow, sectionId: string | null) {
  return {
    id: r.reference_id,
    plexUserId: r.user_id,
    startedAt: r.started * 1000,
    stoppedAt: r.stopped ? r.stopped * 1000 : null,
    playSeconds: Math.max(0, Math.round(r.play_duration ?? 0)),
    percentComplete: r.percent_complete,
    watched: r.watched_status,
    mediaType: r.media_type,
    sectionId: sectionId ?? r.section_id ?? null,
    ratingKey: r.rating_key,
    parentRatingKey: r.parent_rating_key,
    grandparentRatingKey: r.grandparent_rating_key,
    title: r.title,
    parentTitle: r.parent_title,
    grandparentTitle: r.grandparent_title,
    fullTitle: r.full_title,
    year: r.year,
    seasonNumber: r.parent_media_index,
    episodeNumber: r.media_index,
    guid: r.guid,
    thumb: r.thumb,
    platform: r.platform,
    player: r.player,
    product: r.product,
    ipAddress: r.ip_address,
    transcodeDecision: r.transcode_decision,
    location: r.location,
    relayed: r.relayed,
    live: r.live,
  };
}

/**
 * Upserts a page. A grouped play can grow (resumed later), so duration fields update;
 * a known library is never overwritten by an unknown one.
 */
function upsertRows(db: Db, rows: TautulliHistoryRow[], sectionId: string | null): number {
  if (rows.length === 0) return 0;
  db.transaction((tx) => {
    for (const r of rows) {
      const row = toHistoryRow(r, sectionId);
      tx.insert(watchHistory)
        .values(row)
        .onConflictDoUpdate({
          target: watchHistory.id,
          set: {
            stoppedAt: row.stoppedAt,
            playSeconds: row.playSeconds,
            percentComplete: row.percentComplete,
            watched: row.watched,
            sectionId: sql`coalesce(${row.sectionId}, ${watchHistory.sectionId})`,
          },
        })
        .run();
    }
  });
  return rows.length;
}

export interface HistorySyncResult {
  mode: 'backfill' | 'incremental';
  rows: number;
  /** True when the backfill still has pages left (the job re-queues itself). */
  more: boolean;
}

/**
 * Backfill: pages through each library's history (resumable via the cursor), then everything once more
 * unfiltered so plays from deleted libraries are kept too. Stops after `pageBudget` pages so a big
 * server is imported over several job runs instead of one very long one.
 *
 * Incremental: the newest page per library plus the newest unfiltered page, upserted.
 * Grouped plays update in place, so re-reading recent rows is the point, not a waste.
 */
export async function syncHistory(db: Db, reader: TautulliReader, pageBudget = 20): Promise<HistorySyncResult> {
  const cursor = readCursor(db);
  const sections = [...db.select({ id: libraries.sectionId }).from(libraries).all().map((l) => l.id), ''];

  try {
    if (!cursor.backfillDone) {
      let rows = 0;
      let pages = 0;
      for (const section of sections) {
        while (!cursor.done[section]) {
          if (pages >= pageBudget) {
            writeCursor(db, cursor);
            return { mode: 'backfill', rows, more: true };
          }
          const start = cursor.offsets[section] ?? 0;
          const page = await reader.history({ start, length: PAGE, sectionId: section || undefined });
          // The unfiltered pass only fills gaps: rows already tagged with a library keep it.
          rows += upsertRows(db, page.rows, section || null);
          pages++;
          cursor.offsets[section] = start + page.rows.length;
          if (page.rows.length < PAGE || cursor.offsets[section]! >= page.total) cursor.done[section] = true;
          writeCursor(db, cursor);
        }
      }
      cursor.backfillDone = true;
      writeCursor(db, cursor, { ok: true });
      return { mode: 'backfill', rows, more: false };
    }

    // Page back until we overlap known history by a day (covers plays that grew while we were down,
    // and any backlog after downtime), with a hard cap per run.
    const known = db.select({ newest: sql<number | null>`max(${watchHistory.startedAt})` }).from(watchHistory).get()?.newest ?? 0;
    const overlapUntil = known - 86_400_000;
    let rows = 0;
    for (const section of sections) {
      for (let start = 0, pages = 0; pages < pageBudget; pages++) {
        const page = await reader.history({ start, length: 200, sectionId: section || undefined });
        rows += upsertRows(db, page.rows, section || null);
        const oldest = page.rows.at(-1)?.started;
        if (page.rows.length < 200 || oldest === undefined || oldest * 1000 < overlapUntil) break;
        start += page.rows.length;
      }
    }
    writeCursor(db, cursor, { ok: true });
    return { mode: 'incremental', rows, more: false };
  } catch (err) {
    writeCursor(db, cursor, { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
