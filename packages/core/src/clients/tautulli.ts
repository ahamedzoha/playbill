import { z } from 'zod';
import { normalizeBaseUrl, requestJson } from './http';

/** Tautulli wraps every answer as { response: { result, message, data } }. */
const envelope = z.object({
  response: z.object({
    result: z.string(),
    message: z.string().nullable().optional(),
    data: z.unknown(),
  }),
});

export class TautulliClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.base = normalizeBaseUrl(baseUrl);
  }

  async call<T>(cmd: string, params: Record<string, string | number | undefined> = {}, schema?: z.ZodType<T>): Promise<T> {
    const raw = await requestJson<unknown>(`${this.base}/api/v2`, {
      query: { apikey: this.apiKey, cmd, ...params },
      timeoutMs: 30_000,
    });
    const { response } = envelope.parse(raw);
    if (response.result !== 'success') throw new Error(`Tautulli ${cmd} failed: ${response.message ?? 'unknown error'}`);
    return schema ? schema.parse(response.data) : (response.data as T);
  }

  /** Version, plus the Plex server Tautulli is connected to (to check it matches ours). */
  async info(): Promise<{ version: string; pmsIdentifier: string | null; pmsName: string | null }> {
    const [tautulli, server] = await Promise.all([
      this.call('get_tautulli_info', {}, z.object({ tautulli_version: z.string() }).loose()),
      this.call(
        'get_server_info',
        {},
        z.object({ pms_identifier: z.string().optional(), pms_name: z.string().optional() }).loose(),
      ),
    ]);
    return {
      version: tautulli.tautulli_version,
      pmsIdentifier: server.pms_identifier ?? null,
      pmsName: server.pms_name ?? null,
    };
  }
}

// Tautulli mixes numbers, numeric strings, "" and null for the same field across versions.
const num = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().nullable());
const str = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : String(v)), z.string().nullable());
const flag = z.preprocess((v) => v === 1 || v === '1' || v === true, z.boolean());

export const tautulliUser = z
  .object({
    user_id: z.coerce.string(),
    username: z.coerce.string(),
    friendly_name: str,
    email: str,
    thumb: str,
    is_active: flag,
    is_home_user: flag,
    is_admin: flag,
    do_notify: flag.optional(),
    keep_history: flag,
  })
  .loose();
export type TautulliUser = z.infer<typeof tautulliUser>;

export const tautulliUserRow = z
  .object({
    user_id: z.coerce.string(),
    last_seen: num,
    plays: num,
    duration: num,
  })
  .loose();
export type TautulliUserRow = z.infer<typeof tautulliUserRow>;

export const tautulliHistoryRow = z
  .object({
    reference_id: z.coerce.number(),
    user_id: z.coerce.string(),
    started: z.coerce.number(),
    stopped: num,
    play_duration: num,
    percent_complete: num,
    watched_status: num,
    media_type: z.coerce.string(),
    rating_key: str,
    parent_rating_key: str,
    grandparent_rating_key: str,
    title: z.coerce.string(),
    parent_title: str,
    grandparent_title: str,
    full_title: str,
    year: num,
    parent_media_index: num,
    media_index: num,
    guid: str,
    thumb: str,
    platform: str,
    player: str,
    product: str,
    ip_address: str,
    transcode_decision: str,
    location: str,
    relayed: flag,
    live: flag,
    section_id: str.optional(),
  })
  .loose();
export type TautulliHistoryRow = z.infer<typeof tautulliHistoryRow>;

export const tautulliLibrary = z
  .object({
    section_id: z.coerce.string(),
    section_name: z.coerce.string(),
    section_type: z.coerce.string(),
    count: num,
    is_active: flag,
  })
  .loose();
export type TautulliLibrary = z.infer<typeof tautulliLibrary>;

export interface HistoryPage {
  total: number;
  rows: TautulliHistoryRow[];
}

/** Read-side helpers. Kept on a subclass-free object so tests can fake them easily. */
export interface TautulliReader {
  users(): Promise<TautulliUser[]>;
  usersTable(): Promise<TautulliUserRow[]>;
  libraries(): Promise<TautulliLibrary[]>;
  history(opts: { start: number; length: number; sectionId?: string }): Promise<HistoryPage>;
}

export function tautulliReader(client: TautulliClient): TautulliReader {
  return {
    users: () => client.call('get_users', {}, z.array(tautulliUser)),
    async usersTable() {
      const data = await client.call(
        'get_users_table',
        { length: 10_000, order_column: 'last_seen', order_dir: 'desc' },
        z.object({ data: z.array(tautulliUserRow) }).loose(),
      );
      return data.data;
    },
    libraries: () => client.call('get_libraries', {}, z.array(tautulliLibrary)),
    async history({ start, length, sectionId }) {
      const data = await client.call(
        'get_history',
        { start, length, grouping: 1, order_column: 'date', order_dir: 'desc', section_id: sectionId },
        z.object({ recordsFiltered: z.coerce.number(), data: z.array(tautulliHistoryRow) }).loose(),
      );
      return { total: data.recordsFiltered, rows: data.data };
    },
  };
}

export const tautulliRecent = z
  .object({
    added_at: z.coerce.number(),
    media_type: z.coerce.string(),
    rating_key: z.coerce.string(),
    parent_rating_key: str,
    grandparent_rating_key: str,
    title: z.coerce.string(),
    parent_title: str,
    grandparent_title: str,
    year: num,
    thumb: str,
    parent_thumb: str,
    grandparent_thumb: str,
    section_id: str,
    library_name: str,
    media_index: num,
    parent_media_index: num,
  })
  .loose();
export type TautulliRecent = z.infer<typeof tautulliRecent>;

/** Most recently added items across libraries, newest first (episodes, seasons, movies, albums). */
export async function recentlyAdded(client: TautulliClient, count = 60): Promise<TautulliRecent[]> {
  const data = await client.call('get_recently_added', { count }, z.object({ recently_added: z.array(tautulliRecent) }).loose());
  return data.recently_added;
}
