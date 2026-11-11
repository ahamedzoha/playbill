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
