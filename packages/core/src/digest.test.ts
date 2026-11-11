import { describe, expect, it } from 'vitest';
import type { TautulliRecent } from './clients/tautulli';
import { groupComing, groupRecent } from './digest';

const r = (over: Partial<TautulliRecent>): TautulliRecent => ({
  added_at: 1000,
  media_type: 'movie',
  rating_key: '1',
  parent_rating_key: null,
  grandparent_rating_key: null,
  title: 'Film',
  parent_title: null,
  grandparent_title: null,
  year: 2024,
  thumb: '/t',
  parent_thumb: null,
  grandparent_thumb: null,
  section_id: '1',
  library_name: 'Movies',
  media_index: null,
  parent_media_index: null,
  ...over,
});

describe('groupRecent', () => {
  it('lists films, folds episodes into one entry per show, counts albums', () => {
    const g = groupRecent(
      [
        r({ title: 'Dune', added_at: 5 }),
        r({ media_type: 'episode', rating_key: 'e1', grandparent_rating_key: 's1', grandparent_title: 'Andor', grandparent_thumb: '/a', added_at: 4 }),
        r({ media_type: 'episode', rating_key: 'e2', grandparent_rating_key: 's1', grandparent_title: 'Andor', added_at: 3 }),
        r({ media_type: 'season', rating_key: 'x', parent_rating_key: 's2', parent_title: 'Severance', media_index: 2, added_at: 2 }),
        r({ media_type: 'album', title: 'Album', added_at: 2 }),
        r({ title: 'Old', added_at: 0 }),
      ],
      1000,
      10_000,
    );
    expect(g.list.map((i) => [i.title, i.detail])).toEqual([
      ['Dune', '2024'],
      ['Andor', '2 new episodes'],
      ['Severance', 'Season 2'],
    ]);
    expect(g.list[1]!.image).toEqual({ k: 'plex', p: '/a', w: 240, h: 360 });
    expect(g.other).toBe(1);
  });
});

describe('groupComing', () => {
  it('shows a series once at its first airing, with a count of the rest', () => {
    const items = groupComing([
      { kind: 'episode', title: 'Andor', detail: 'S2 E2', at: 20, posterUrl: null },
      { kind: 'episode', title: 'Andor', detail: 'S2 E1', at: 10, posterUrl: 'https://x/p.jpg' },
      { kind: 'movie', title: 'Dune (2024)', detail: 'Digital release', at: 15, posterUrl: null },
    ]);
    expect(items.map((i) => [i.title, i.detail, i.at])).toEqual([
      ['Andor', 'S2 E1 + 1 more', 10],
      ['Dune (2024)', 'Digital release', 15],
    ]);
  });
});
