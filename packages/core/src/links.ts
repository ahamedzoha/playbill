import { crypto } from './crypto';

/**
 * Signed tokens for links in emails. They never expire: an unsubscribe link in a two-year-old email
 * must still work, and image URLs are cached by mail clients for years.
 */

function pack(purpose: string, value: string): string {
  const v = Buffer.from(value, 'utf8').toString('base64url');
  return `${v}.${crypto().sign(purpose, value)}`;
}

function unpack(purpose: string, token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  let value: string;
  try {
    value = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
  } catch {
    return null;
  }
  return crypto().verify(purpose, value, token.slice(dot + 1)) ? value : null;
}

/** Preferences page for one person (also used by one-click unsubscribe). */
export const preferenceToken = (plexUserId: string) => pack('prefs', plexUserId);
export const readPreferenceToken = (token: string) => unpack('prefs', token);

/** The web version of one delivered email. */
export const viewToken = (deliveryId: string) => pack('view', deliveryId);
export const readViewToken = (token: string) => unpack('view', token);

/** What the image proxy may fetch: a Plex image path, or a remote poster URL. */
export type ImageRef = { k: 'plex'; p: string; w: number; h: number } | { k: 'url'; u: string };

export const imageToken = (ref: ImageRef) => pack('img', JSON.stringify(ref));
export function readImageToken(token: string): ImageRef | null {
  const raw = unpack('img', token);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImageRef;
  } catch {
    return null;
  }
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}
