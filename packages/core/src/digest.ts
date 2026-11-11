import { and, gte, lt, sql } from 'drizzle-orm';
import type { ComingItem, FilledRequest, RadarrClient, SeerrClient, SonarrClient } from './clients/arr';
import { type TautulliClient, type TautulliRecent, recentlyAdded } from './clients/tautulli';
import type { Db } from './db';
import { people, watchHistory } from './db/schema';
import type { ImageRef } from './links';
import { logger, errorMessage } from './log';

const DAY = 86_400_000;
const log = logger('digest');

export interface DigestItem {
  title: string;
  detail: string | null;
  library: string | null;
  image: ImageRef | null;
}

export interface DigestContent {
  windowStart: number;
  windowEnd: number;
  added: DigestItem[];
  /** Albums and other items that are counted, not listed. */
  addedOther: number;
  coming: (DigestItem & { at: number })[];
  requests: DigestItem[];
  stats: { plays: number; hours: number; watchers: number; audience: number; topTitle: string | null } | null;
}

export interface DigestSources {
  tautulli: TautulliClient | null;
  seerr: SeerrClient | null;
  sonarrs: SonarrClient[];
  radarrs: RadarrClient[];
}

export interface DigestOptions {
  sections: { added: boolean; coming: boolean; requests: boolean; stats: boolean };
  maxItems: number;
}

const plexImage = (p: string | null): ImageRef | null => (p ? { k: 'plex', p, w: 240, h: 360 } : null);
const remoteImage = (u: string | null): ImageRef | null => (u ? { k: 'url', u } : null);

/**
 * Collapses Tautulli's recently-added list into what a person would call "new":
 * one entry per film, one per show (counting its new episodes), albums counted only.
 */
export function groupRecent(items: TautulliRecent[], since: number, until: number): { list: DigestItem[]; other: number } {
  const shows = new Map<string, { title: string; episodes: number; seasons: Set<number>; image: ImageRef | null; library: string | null; at: number }>();
  const movies: (DigestItem & { at: number })[] = [];
  let other = 0;
  for (const it of items) {
    const at = it.added_at * 1000;
    if (at < since || at >= until) continue;
    switch (it.media_type) {
      case 'movie':
        movies.push({ title: it.title, detail: it.year ? String(it.year) : null, library: it.library_name, image: plexImage(it.thumb), at });
        break;
      case 'episode':
      case 'season':
      case 'show': {
        const key = it.media_type === 'episode' ? it.grandparent_rating_key : it.media_type === 'season' ? it.parent_rating_key : it.rating_key;
        const title = it.media_type === 'episode' ? it.grandparent_title : it.media_type === 'season' ? it.parent_title : it.title;
        if (!key || !title) break;
        const thumb = it.media_type === 'episode' ? it.grandparent_thumb : it.media_type === 'season' ? it.parent_thumb : it.thumb;
        const s = shows.get(key) ?? { title, episodes: 0, seasons: new Set<number>(), image: plexImage(thumb), library: it.library_name, at };
        if (it.media_type === 'episode') s.episodes++;
        if (it.media_type === 'season' && it.media_index !== null) s.seasons.add(it.media_index);
        if (it.media_type === 'show') s.seasons.add(-1);
        s.at = Math.max(s.at, at);
        shows.set(key, s);
        break;
      }
      default:
        other++;
    }
  }
  const showItems = [...shows.values()].map((s) => {
    let detail: string;
    if (s.seasons.has(-1)) detail = 'New series';
    else if (s.seasons.size === 1 && s.episodes === 0) detail = `Season ${[...s.seasons][0]}`;
    else if (s.seasons.size > 1) detail = `${s.seasons.size} new seasons`;
    else detail = s.episodes === 1 ? 'New episode' : `${s.episodes} new episodes`;
    return { title: s.title, detail, library: s.library, image: s.image, at: s.at };
  });
  const list = [...movies, ...showItems].sort((a, b) => b.at - a.at).map(({ at: _at, ...rest }) => rest);
  return { list, other };
}

/** Shows airing several episodes in the week appear once, at their first airing. */
export function groupComing(items: ComingItem[]): (DigestItem & { at: number })[] {
  const byTitle = new Map<string, ComingItem & { count: number }>();
  for (const it of items.sort((a, b) => a.at - b.at)) {
    const cur = byTitle.get(`${it.kind}:${it.title}`);
    if (cur) cur.count++;
    else byTitle.set(`${it.kind}:${it.title}`, { ...it, count: 1 });
  }
  return [...byTitle.values()].map((c) => ({
    title: c.title,
    detail: c.kind === 'episode' && c.count > 1 ? `${c.detail} + ${c.count - 1} more` : c.detail,
    library: null,
    image: remoteImage(c.posterUrl),
    at: c.at,
  }));
}

function stats(db: Db, since: number, until: number): DigestContent['stats'] {
  const t = db
    .select({
      plays: sql<number>`count(*)`,
      seconds: sql<number>`coalesce(sum(${watchHistory.playSeconds}), 0)`,
      watchers: sql<number>`count(distinct ${watchHistory.plexUserId})`,
    })
    .from(watchHistory)
    .where(and(gte(watchHistory.startedAt, since), lt(watchHistory.startedAt, until)))
    .get();
  const top = db
    .select({ title: sql<string>`coalesce(${watchHistory.grandparentTitle}, ${watchHistory.title})`, n: sql<number>`count(distinct ${watchHistory.plexUserId})` })
    .from(watchHistory)
    .where(and(gte(watchHistory.startedAt, since), lt(watchHistory.startedAt, until)))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`, sql`count(*) desc`)
    .limit(1)
    .get();
  const audience = db
    .select({ n: sql<number>`count(*)` })
    .from(people)
    .where(sql`${people.status} in ('shared', 'home')`)
    .get()?.n ?? 0;
  return {
    plays: t?.plays ?? 0,
    hours: Math.round((t?.seconds ?? 0) / 3600),
    watchers: t?.watchers ?? 0,
    audience,
    // Only name a title when more than one person watched it: totals, never anyone's habits.
    topTitle: top && top.n > 1 ? top.title : null,
  };
}

/**
 * Gathers one digest's content. Each source is optional and isolated: if Sonarr is down, the digest
 * still goes out with everything else.
 */
export async function buildDigest(db: Db, src: DigestSources, opts: DigestOptions, since: number, until: number): Promise<DigestContent> {
  const content: DigestContent = { windowStart: since, windowEnd: until, added: [], addedOther: 0, coming: [], requests: [], stats: null };

  if (opts.sections.added && src.tautulli) {
    try {
      const g = groupRecent(await recentlyAdded(src.tautulli, 100), since, until);
      content.added = g.list.slice(0, opts.maxItems);
      content.addedOther = g.other + Math.max(0, g.list.length - opts.maxItems);
    } catch (err) {
      log.warn('recently added unavailable', { error: errorMessage(err) });
    }
  }
  if (opts.sections.coming && (src.sonarrs.length || src.radarrs.length)) {
    const end = until + 7 * DAY;
    const lists = await Promise.all(
      [...src.sonarrs, ...src.radarrs].map((c) =>
        c.upcoming(until, end).catch((err: unknown) => {
          log.warn('calendar unavailable', { error: errorMessage(err) });
          return [];
        }),
      ),
    );
    content.coming = groupComing(lists.flat()).slice(0, Math.max(4, Math.floor(opts.maxItems / 2)));
  }
  if (opts.sections.requests && src.seerr) {
    try {
      const filled: FilledRequest[] = await src.seerr.filledSince(since);
      // A request that's already listed under "New this week" isn't repeated.
      const listed = new Set(content.added.map((a) => a.title.toLowerCase()));
      content.requests = filled
        .filter((f) => f.availableAt < until && !listed.has(f.title.toLowerCase()))
        .slice(0, opts.maxItems)
        .map((f) => ({ title: f.title, detail: f.mediaType === 'movie' ? 'Film' : 'Series', library: null, image: remoteImage(f.posterUrl) }));
    } catch (err) {
      log.warn('requests unavailable', { error: errorMessage(err) });
    }
  }
  if (opts.sections.stats) content.stats = stats(db, since, until);
  return content;
}

export function isEmptyDigest(c: DigestContent): boolean {
  return c.added.length === 0 && c.addedOther === 0 && c.coming.length === 0 && c.requests.length === 0;
}
