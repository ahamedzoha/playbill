import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '@playbill/core';
import { readImageToken } from '@playbill/core/links';
import { ownerCredentials } from '@playbill/core/owner';
import { getSetting } from '@playbill/core/settings';
import { db } from '@/lib/server';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const HEADERS = { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' };

/**
 * Posters for emails. Public, because mail clients fetch images without cookies, but only for
 * HMAC-signed references, so it can't be used as an open proxy or to browse the Plex library.
 * Plex images are resized by Plex's own transcoder; the Plex token never leaves the server.
 * Results are cached on disk forever: email clients cache image URLs for years.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ref = readImageToken(token);
  if (!ref) return new Response('Not found', { status: 404 });

  const dir = join(config().configDir, 'cache', 'images');
  const file = join(dir, `${createHash('sha256').update(token).digest('hex').slice(0, 32)}.jpg`);
  try {
    if (statSync(file).size > 0) return new Response(readFileSync(file), { headers: HEADERS });
  } catch {
    // Not cached yet.
  }

  let url: string;
  const headers: Record<string, string> = {};
  if (ref.k === 'plex') {
    const plex = getSetting(db(), 'plex');
    const creds = ownerCredentials(db());
    if (!plex || !creds) return new Response('Not available', { status: 503 });
    const q = new URLSearchParams({ width: String(ref.w), height: String(ref.h), minSize: '1', upscale: '1', url: ref.p });
    url = `${plex.url}/photo/:/transcode?${q}`;
    headers['X-Plex-Token'] = creds.token;
  } else {
    url = ref.u;
  }

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return new Response('Not available', { status: 404 });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return new Response('Not available', { status: 404 });
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, buf);
    return new Response(buf, { headers: { ...HEADERS, 'Content-Type': res.headers.get('content-type') ?? 'image/jpeg' } });
  } catch {
    return new Response('Not available', { status: 504 });
  }
}
