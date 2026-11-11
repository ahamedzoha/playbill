import { describe, expect, it } from 'vitest';
import type { TautulliHistoryRow, TautulliReader } from '../clients/tautulli';
import { openTestDb } from '../db/migrate';
import { libraries, watchHistory } from '../db/schema';
import { syncHistory } from './history';

function row(id: number, section: string | null, started: number, extra: Partial<TautulliHistoryRow> = {}): TautulliHistoryRow & { _section: string | null } {
  return {
    reference_id: id,
    user_id: '7',
    started,
    stopped: started + 600,
    play_duration: 500,
    percent_complete: 90,
    watched_status: 1,
    media_type: 'movie',
    rating_key: String(id),
    parent_rating_key: null,
    grandparent_rating_key: null,
    title: `Title ${id}`,
    parent_title: null,
    grandparent_title: null,
    full_title: `Title ${id}`,
    year: 2020,
    parent_media_index: null,
    media_index: null,
    guid: null,
    thumb: null,
    platform: 'Roku',
    player: 'Living room',
    product: 'Plex for Roku',
    ip_address: '10.0.0.2',
    transcode_decision: 'direct play',
    location: 'lan',
    relayed: false,
    live: false,
    _section: section,
    ...extra,
  };
}

/** Fake Tautulli: rows sorted newest first, filtered by section like the real API. */
function fakeReader(all: ReturnType<typeof row>[]) {
  const calls: { start: number; sectionId?: string }[] = [];
  const reader: TautulliReader = {
    users: async () => [],
    usersTable: async () => [],
    libraries: async () => [],
    async history({ start, length, sectionId }) {
      calls.push({ start, sectionId });
      const filtered = all
        .filter((r) => (sectionId ? r._section === sectionId : true))
        .sort((a, b) => b.started - a.started);
      return { total: filtered.length, rows: filtered.slice(start, start + length) };
    },
  };
  return { reader, calls, all };
}

function setup() {
  const { db } = openTestDb();
  db.insert(libraries)
    .values([
      { sectionId: '1', name: 'Movies', type: 'movie', syncedAt: 0 },
      { sectionId: '2', name: 'TV', type: 'show', syncedAt: 0 },
    ])
    .run();
  return db;
}

describe('syncHistory', () => {
  it('backfills every library, tags rows, keeps rows from deleted libraries', async () => {
    const db = setup();
    const { reader } = fakeReader([row(1, '1', 1000), row(2, '2', 2000), row(3, null, 3000)]);
    const r = await syncHistory(db, reader);
    expect(r).toMatchObject({ mode: 'backfill', rows: 5, more: false });
    const rows = db.select().from(watchHistory).all();
    expect(rows.map((x) => [x.id, x.sectionId])).toEqual([
      [1, '1'],
      [2, '2'],
      [3, null],
    ]);
  });

  it('resumes a backfill across runs when the page budget runs out', async () => {
    const db = setup();
    const many = Array.from({ length: 2500 }, (_, i) => row(i + 1, '1', 1_000_000 + i));
    const { reader } = fakeReader(many);
    const first = await syncHistory(db, reader, 2);
    expect(first.more).toBe(true);
    let r = first;
    while (r.more) r = await syncHistory(db, reader, 2);
    expect(db.select().from(watchHistory).all()).toHaveLength(2500);
  });

  it('incremental sync picks up new plays and updates a resumed one', async () => {
    const db = setup();
    const data = [row(1, '1', 1_000_000)];
    const { reader, all } = fakeReader(data);
    await syncHistory(db, reader);
    // Play 1 was resumed (longer), and a new play happened.
    all[0] = row(1, '1', 1_000_000, { play_duration: 4000, percent_complete: 100 });
    all.push(row(2, '2', 1_100_000));
    const r = await syncHistory(db, reader);
    expect(r.mode).toBe('incremental');
    const rows = db.select().from(watchHistory).all();
    expect(rows).toHaveLength(2);
    expect(rows.find((x) => x.id === 1)?.playSeconds).toBe(4000);
  });

  it('pages back after downtime until it overlaps known history', async () => {
    const db = setup();
    const { reader, all } = fakeReader([row(1, '1', 1_000_000)]);
    await syncHistory(db, reader);
    for (let i = 0; i < 450; i++) all.push(row(100 + i, '1', 2_000_000 + i * 60));
    await syncHistory(db, reader);
    expect(db.select().from(watchHistory).all()).toHaveLength(451);
  });
});
