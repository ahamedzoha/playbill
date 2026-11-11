import { z } from 'zod';
import { normalizeBaseUrl, requestJson } from './http';

const poster = (images: { coverType?: string; remoteUrl?: string | null }[] | undefined) =>
  images?.find((i) => i.coverType === 'poster' && i.remoteUrl)?.remoteUrl ?? null;

const imageList = z.array(z.object({ coverType: z.string().optional(), remoteUrl: z.string().nullable().optional() }).loose()).optional();

export interface ComingItem {
  kind: 'episode' | 'movie';
  title: string;
  /** e.g. "S2 E5" for episodes; release kind for movies ("In cinemas", "Digital"). */
  detail: string;
  at: number;
  posterUrl: string | null;
}

/** Shared by Sonarr and Radarr: both speak /api/v3 with an X-Api-Key header. */
class ArrClient {
  protected readonly base: string;
  constructor(
    baseUrl: string,
    protected readonly apiKey: string,
  ) {
    this.base = normalizeBaseUrl(baseUrl);
  }
  protected get<T>(path: string, query?: Record<string, string | number | boolean | undefined>) {
    return requestJson<T>(`${this.base}${path}`, { headers: { 'X-Api-Key': this.apiKey }, query, timeoutMs: 20_000 });
  }
  async version(): Promise<string> {
    const s = await this.get<{ version?: string }>('/api/v3/system/status');
    return s.version ?? 'unknown';
  }
}

export class SonarrClient extends ArrClient {
  /** Episodes airing in [start, end), grouped by the caller. */
  async upcoming(start: number, end: number): Promise<ComingItem[]> {
    const rows = z
      .array(
        z
          .object({
            seasonNumber: z.number(),
            episodeNumber: z.number(),
            airDateUtc: z.string().optional(),
            hasFile: z.boolean().optional(),
            series: z.object({ title: z.string(), images: imageList }).loose().optional(),
          })
          .loose(),
      )
      .parse(
        await this.get('/api/v3/calendar', {
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          includeSeries: true,
          unmonitored: false,
        }),
      );
    return rows
      .filter((r) => r.series && r.airDateUtc)
      .map((r) => ({
        kind: 'episode' as const,
        title: r.series!.title,
        detail: `S${r.seasonNumber} E${r.episodeNumber}`,
        at: Date.parse(r.airDateUtc!),
        posterUrl: poster(r.series!.images),
      }));
  }
}

export class RadarrClient extends ArrClient {
  /** Movies with a cinema, digital or physical release in [start, end). */
  async upcoming(start: number, end: number): Promise<ComingItem[]> {
    const rows = z
      .array(
        z
          .object({
            title: z.string(),
            year: z.number().optional(),
            inCinemas: z.string().optional(),
            digitalRelease: z.string().optional(),
            physicalRelease: z.string().optional(),
            hasFile: z.boolean().optional(),
            images: imageList,
          })
          .loose(),
      )
      .parse(await this.get('/api/v3/calendar', { start: new Date(start).toISOString(), end: new Date(end).toISOString(), unmonitored: false }));
    const out: ComingItem[] = [];
    for (const m of rows) {
      if (m.hasFile) continue;
      const dates: [string, string | undefined][] = [
        ['Digital release', m.digitalRelease],
        ['Disc release', m.physicalRelease],
        ['In cinemas', m.inCinemas],
      ];
      const hit = dates.map(([k, v]) => [k, v ? Date.parse(v) : NaN] as const).find(([, t]) => t >= start && t < end);
      if (!hit) continue;
      out.push({ kind: 'movie', title: m.year ? `${m.title} (${m.year})` : m.title, detail: hit[0], at: hit[1], posterUrl: poster(m.images) });
    }
    return out;
  }
}

export interface FilledRequest {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  availableAt: number;
  /** Plex account id of the requester, for leaving them out of "it's here" alerts later. Never shown to others. */
  requestedByPlexId: string | null;
}

export class SeerrClient {
  private readonly base: string;
  constructor(
    baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.base = normalizeBaseUrl(baseUrl);
  }
  private get<T>(path: string, query?: Record<string, string | number | undefined>) {
    return requestJson<T>(`${this.base}/api/v1${path}`, { headers: { 'X-Api-Key': this.apiKey }, query, timeoutMs: 20_000 });
  }
  async version(): Promise<string> {
    return (await this.get<{ version?: string }>('/status')).version ?? 'unknown';
  }

  /** Requests that became available since `since` (by media update time). */
  async filledSince(since: number, take = 40): Promise<FilledRequest[]> {
    const data = z
      .object({
        results: z.array(
          z
            .object({
              media: z.object({ tmdbId: z.number().nullable().optional(), mediaType: z.enum(['movie', 'tv']), updatedAt: z.string().optional() }).loose(),
              updatedAt: z.string().optional(),
              requestedBy: z.object({ plexId: z.number().nullable().optional() }).loose().optional(),
            })
            .loose(),
        ),
      })
      .loose()
      .parse(await this.get('/request', { take, skip: 0, filter: 'available', sort: 'modified' }));
    const recent = data.results.filter((r) => {
      const t = Date.parse(r.media.updatedAt ?? r.updatedAt ?? '');
      return r.media.tmdbId && t >= since;
    });
    const seen = new Set<string>();
    const out: FilledRequest[] = [];
    for (const r of recent) {
      const key = `${r.media.mediaType}:${r.media.tmdbId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const info = await this.get<{ title?: string; name?: string; posterPath?: string | null }>(`/${r.media.mediaType}/${r.media.tmdbId}`);
        out.push({
          mediaType: r.media.mediaType,
          tmdbId: r.media.tmdbId!,
          title: info.title ?? info.name ?? 'Untitled',
          posterUrl: info.posterPath ? `https://image.tmdb.org/t/p/w342${info.posterPath}` : null,
          availableAt: Date.parse(r.media.updatedAt ?? r.updatedAt ?? '') || since,
          requestedByPlexId: r.requestedBy?.plexId ? String(r.requestedBy.plexId) : null,
        });
      } catch {
        // A title Seerr can't describe any more is skipped rather than failing the digest.
      }
    }
    return out;
  }
}
