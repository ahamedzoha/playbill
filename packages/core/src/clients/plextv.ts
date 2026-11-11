import { z } from 'zod';
import { HttpError, requestJson } from './http';

const PLEX_TV = 'https://plex.tv';

export const PRODUCT = 'Playbill';

export function plexHeaders(clientId: string, token?: string): Record<string, string> {
  return {
    'X-Plex-Product': PRODUCT,
    'X-Plex-Version': process.env.APP_VERSION || '0.0.0',
    'X-Plex-Client-Identifier': clientId,
    'X-Plex-Platform': 'Web',
    'X-Plex-Device-Name': PRODUCT,
    ...(token ? { 'X-Plex-Token': token } : {}),
  };
}

const pinSchema = z.object({
  id: z.number(),
  code: z.string(),
  authToken: z.string().nullable().optional(),
  expiresAt: z.string().optional(),
});
export type PlexPin = z.infer<typeof pinSchema>;

const userSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  username: z.string(),
  title: z.string().optional(),
  email: z.string().nullable().optional(),
  thumb: z.string().nullable().optional(),
});
export type PlexAccount = z.infer<typeof userSchema>;

const connectionSchema = z.object({
  protocol: z.string(),
  address: z.string(),
  port: z.number(),
  uri: z.string(),
  local: z.boolean(),
  relay: z.boolean().optional().default(false),
});
export type PlexConnection = z.infer<typeof connectionSchema>;

const resourceSchema = z.object({
  name: z.string(),
  product: z.string().optional(),
  provides: z.string(),
  owned: z.boolean().optional().default(false),
  clientIdentifier: z.string(),
  accessToken: z.string().nullable().optional(),
  connections: z.array(connectionSchema).default([]),
});
export type PlexResource = z.infer<typeof resourceSchema>;

/** Step 1 of Plex sign-in: a PIN the user approves at app.plex.tv. */
export async function createPin(clientId: string): Promise<PlexPin> {
  const raw = await requestJson<unknown>(`${PLEX_TV}/api/v2/pins`, {
    method: 'POST',
    headers: plexHeaders(clientId),
    query: { strong: true },
  });
  return pinSchema.parse(raw);
}

/** The page the user opens to approve the PIN. */
export function authUrl(clientId: string, code: string, forwardUrl?: string): string {
  const params = new URLSearchParams({
    clientID: clientId,
    code,
    'context[device][product]': PRODUCT,
  });
  if (forwardUrl) params.set('forwardUrl', forwardUrl);
  return `https://app.plex.tv/auth#?${params.toString()}`;
}

/** Step 2: poll the PIN. Returns the account token once the user approved, else null. */
export async function checkPin(clientId: string, id: number): Promise<string | null> {
  try {
    const raw = await requestJson<unknown>(`${PLEX_TV}/api/v2/pins/${id}`, { headers: plexHeaders(clientId) });
    return pinSchema.parse(raw).authToken ?? null;
  } catch (err) {
    // An expired PIN is a 404; treat it as "not approved" so the UI can offer a new one.
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

export async function getAccount(clientId: string, token: string): Promise<PlexAccount> {
  const raw = await requestJson<unknown>(`${PLEX_TV}/api/v2/user`, { headers: plexHeaders(clientId, token) });
  return userSchema.parse(raw);
}

/** Plex Media Servers this account can see. `owned` marks the ones it runs. */
export async function getServers(clientId: string, token: string): Promise<PlexResource[]> {
  const raw = await requestJson<unknown[]>(`${PLEX_TV}/api/v2/resources`, {
    headers: plexHeaders(clientId, token),
    query: { includeHttps: 1, includeRelay: 1, includeIPv6: 0 },
  });
  return z
    .array(resourceSchema)
    .parse(raw)
    .filter((r) => r.provides.split(',').includes('server'));
}

/** Local before remote, relay last: the order Playbill tries connections in. */
export function rankConnections(connections: PlexConnection[]): PlexConnection[] {
  const score = (c: PlexConnection) => (c.relay ? 2 : c.local ? 0 : 1);
  return [...connections].sort((a, b) => score(a) - score(b));
}

/** Confirms `url` reaches the expected server. Returns the server's machine id. */
export async function probeServer(url: string, token: string, timeoutMs = 5_000): Promise<string> {
  const raw = await requestJson<{ MediaContainer?: { machineIdentifier?: string } }>(
    `${url.replace(/\/+$/, '')}/identity`,
    { headers: { 'X-Plex-Token': token }, timeoutMs },
  );
  const id = raw.MediaContainer?.machineIdentifier;
  if (!id) throw new Error(`${url} answered but is not a Plex Media Server`);
  return id;
}

/** First connection that answers with the right machine id, trying them all in parallel. */
export async function findWorkingConnection(
  resource: PlexResource,
  token: string,
  extraUrls: string[] = [],
): Promise<{ url: string; tried: { url: string; ok: boolean; error?: string }[] }> {
  const candidates = [...extraUrls, ...rankConnections(resource.connections).map((c) => c.uri)];
  const unique = [...new Set(candidates)];
  const results = await Promise.all(
    unique.map(async (url) => {
      try {
        const id = await probeServer(url, token);
        if (id !== resource.clientIdentifier) return { url, ok: false, error: 'a different Plex server answered' };
        return { url, ok: true };
      } catch (err) {
        return { url, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  const winner = results.find((r) => r.ok);
  if (!winner) throw Object.assign(new Error('No connection to this Plex server worked'), { tried: results });
  return { url: winner.url, tried: results };
}
