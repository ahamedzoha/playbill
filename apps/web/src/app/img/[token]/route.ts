import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '@playbill/core';
import { type ImageRef, readImageToken } from '@playbill/core/links';
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
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length === 0 || raw.length > MAX_BYTES) return new Response('Not available', { status: 404 });
    const shaped = await shape(raw, ref);
    const buf: Buffer<ArrayBuffer> = shaped ?? raw;
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, buf);
    return new Response(buf, { headers: { ...HEADERS, 'Content-Type': shaped ? 'image/jpeg' : (res.headers.get('content-type') ?? 'image/jpeg') } });
  } catch {
    return new Response('Not available', { status: 504 });
  }
}

const INK = '#0c0c0e';
const LEAD = { w: 880, h: 1100 };

/**
 * Exact poster shapes for email layouts, which can't crop with CSS: Plex images come out at exactly
 * the size asked for (cover, centred), and the lead poster is cropped to 4:5 from the top (the
 * corner badges at the foot go) and faded into the email's ink at the bottom and sides, so it sits
 * in the page instead of floating on it. Returns null when sharp isn't available or the image won't
 * decode; the caller then serves the original.
 */
async function shape(buf: Buffer<ArrayBuffer>, ref: ImageRef): Promise<Buffer<ArrayBuffer> | null> {
  const size = ref.fx === 'lead' ? LEAD : ref.k === 'plex' ? { w: ref.w, h: ref.h } : null;
  if (!size) return null;
  try {
    const sharp = (await import('sharp')).default;
    const img = sharp(buf).resize(size.w, size.h, { fit: 'cover', position: ref.fx === 'lead' ? 'top' : 'centre' });
    if (ref.fx === 'lead') {
      const fade = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}">
        <defs>
          <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0.6" stop-color="${INK}" stop-opacity="0"/><stop offset="0.86" stop-color="${INK}" stop-opacity="0.72"/><stop offset="1" stop-color="${INK}" stop-opacity="1"/></linearGradient>
          <linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${INK}" stop-opacity="0.7"/><stop offset="0.07" stop-color="${INK}" stop-opacity="0"/><stop offset="0.93" stop-color="${INK}" stop-opacity="0"/><stop offset="1" stop-color="${INK}" stop-opacity="0.7"/></linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#l)"/><rect width="100%" height="100%" fill="url(#b)"/>
      </svg>`;
      img.composite([{ input: Buffer.from(fade), blend: 'over' }]);
    }
    return Buffer.from(await img.jpeg({ quality: 82, mozjpeg: true }).toBuffer());
  } catch {
    return null;
  }
}
