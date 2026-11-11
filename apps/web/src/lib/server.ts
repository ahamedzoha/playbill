import 'server-only';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { config } from '@playbill/core';
import { SESSION_COOKIE, SESSION_TTL_MS, type Admin, validateSession } from '@playbill/core/auth';
import { getDb } from '@playbill/core/db';

export const SETUP_COOKIE = 'playbill_setup';

export function db() {
  return getDb();
}

/** The signed-in admin, or null. Server components and route handlers only. */
export async function currentAdmin(): Promise<Admin | null> {
  const jar = await cookies();
  return validateSession(db(), jar.get(SESSION_COOKIE)?.value);
}

/** The owner's session, or null. Setup and management actions are owner-only. */
export async function currentOwner(): Promise<Admin | null> {
  const admin = await currentAdmin();
  return admin?.role === 'owner' ? admin : null;
}

/** Cookies are Secure when the request came in over HTTPS (directly or via a reverse proxy). */
export async function isHttps(): Promise<boolean> {
  const h = await headers();
  return h.get('x-forwarded-proto') === 'https' || (h.get('referer') ?? '').startsWith('https://');
}

export async function setSessionCookie(res: NextResponse, token: string): Promise<void> {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: await isHttps(),
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function jsonError(status: number, message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Wraps a route handler so thrown errors become JSON instead of an HTML 500 page. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonError(500, message);
    }
  };
}

export function appInfo() {
  const c = config();
  return { version: c.version || '0.0.0-dev', revision: c.revision };
}
