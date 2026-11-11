import { XMLParser } from 'fast-xml-parser';
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

// ---------------------------------------------------------------------------------------------
// Sharing (read side). These plex.tv endpoints answer XML only.

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false });

async function requestXml(url: string, clientId: string, token: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { headers: plexHeaders(clientId, token), signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    throw new HttpError(`Could not reach plex.tv: ${err instanceof Error ? err.message : String(err)}`, null, url);
  }
  if (!res.ok) throw new HttpError(`${res.status} ${res.statusText} from ${url}`, res.status, url);
  return xml.parse(await res.text()) as Record<string, unknown>;
}

/** XML lists come back as an object when there is one child and an array when there are more. */
function list<T>(value: unknown): T[] {
  if (value === undefined || value === null || value === '') return [];
  return (Array.isArray(value) ? value : [value]) as T[];
}

const bool = (v: unknown) => v === '1' || v === 'true' || v === true;
const epochMs = (v: unknown) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n * 1000 : null;
};

export interface PlexFriend {
  id: string;
  username: string;
  title: string;
  email: string | null;
  thumb: string | null;
  home: boolean;
  restricted: boolean;
  allowSync: boolean;
  filters: Record<string, string>;
  /** Present when this friend has access to (or a pending invite for) our server. */
  server: { pending: boolean; lastSeenAt: number | null; allLibraries: boolean; numLibraries: number } | null;
}

/** Everyone in the owner's friends and Plex Home, with their state on `machineId`. */
export async function getFriends(clientId: string, token: string, machineId: string): Promise<PlexFriend[]> {
  const doc = await requestXml('https://plex.tv/api/users', clientId, token);
  const users = list<Record<string, unknown>>((doc.MediaContainer as Record<string, unknown> | undefined)?.User);
  return users.map((u) => {
    const server = list<Record<string, string>>(u.Server).find((s) => s.machineIdentifier === machineId);
    return {
      id: String(u.id),
      username: String(u.username ?? ''),
      title: String(u.title ?? u.username ?? ''),
      email: u.email ? String(u.email) : null,
      thumb: u.thumb ? String(u.thumb) : null,
      home: bool(u.home),
      restricted: bool(u.restricted),
      allowSync: bool(u.allowSync),
      filters: Object.fromEntries(
        ['filterAll', 'filterMovies', 'filterMusic', 'filterPhotos', 'filterTelevision']
          .filter((k) => u[k])
          .map((k) => [k, String(u[k])]),
      ),
      server: server
        ? {
            pending: bool(server.pending),
            lastSeenAt: epochMs(server.lastSeenAt),
            allLibraries: bool(server.allLibraries),
            numLibraries: Number(server.numLibraries ?? 0),
          }
        : null,
    };
  });
}

export interface PlexShare {
  shareId: string;
  userId: string;
  username: string;
  email: string | null;
  invitedAt: number | null;
  acceptedAt: number | null;
  allLibraries: boolean;
  allowSync: boolean;
  /** Section ids (library keys on our server) this person can see. */
  sectionIds: string[];
}

/** Per-library shares on our server, including invite and accept times. */
export async function getShares(clientId: string, token: string, machineId: string): Promise<PlexShare[]> {
  const doc = await requestXml(`https://plex.tv/api/servers/${machineId}/shared_servers`, clientId, token);
  const shares = list<Record<string, unknown>>((doc.MediaContainer as Record<string, unknown> | undefined)?.SharedServer);
  return shares.map((s) => ({
    shareId: String(s.id),
    userId: String(s.userID),
    username: String(s.username ?? ''),
    email: s.email ? String(s.email) : null,
    invitedAt: epochMs(s.invitedAt),
    acceptedAt: epochMs(s.acceptedAt),
    allLibraries: bool(s.allLibraries),
    allowSync: bool(s.allowSync),
    sectionIds: list<Record<string, string>>(s.Section)
      .filter((sec) => bool(sec.shared))
      .map((sec) => String(sec.key)),
  }));
}

export interface PlexInvite {
  id: string;
  email: string | null;
  username: string | null;
  friendlyName: string | null;
  thumb: string | null;
  createdAt: number | null;
  /** Machine ids of servers the invite covers. */
  servers: string[];
}

/** Invites the owner sent that haven't been accepted yet. */
export async function getPendingInvites(clientId: string, token: string): Promise<PlexInvite[]> {
  const doc = await requestXml('https://plex.tv/api/invites/requested', clientId, token);
  const invites = list<Record<string, unknown>>((doc.MediaContainer as Record<string, unknown> | undefined)?.Invite);
  return invites.map((i) => ({
    id: String(i.id),
    email: i.email ? String(i.email) : null,
    username: i.username ? String(i.username) : null,
    friendlyName: i.friendlyName ? String(i.friendlyName) : null,
    thumb: i.thumb ? String(i.thumb) : null,
    createdAt: epochMs(i.createdAt),
    servers: list<Record<string, string>>(i.Server).map((s) => String(s.machineIdentifier ?? s.id ?? '')),
  }));
}
