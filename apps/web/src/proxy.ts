import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'playbill_session';

/** Pages and APIs anyone may reach. Everything else needs a session (checked properly server-side). */
const PUBLIC_PREFIXES = ['/login', '/setup', '/api/health', '/api/auth/', '/api/setup/code', '/api/hooks/', '/api/unsubscribe/', '/u/', '/v/', '/img/', '/go/'];

/**
 * Optimistic check only: no cookie → off to sign in. Pages and route handlers still validate the
 * session against the database, because a cookie that exists can still be expired or forged.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|icon.svg|robots.txt).*)'],
};
