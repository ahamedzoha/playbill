import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { hasOwner } from '@playbill/core/auth';
import { crypto } from '@playbill/core/crypto';
import { instanceClientId } from '@playbill/core/settings';
import { checkSetupCode, ensureSetupCode } from '@playbill/core/setup';
import { SETUP_COOKIE, db, handle, isHttps, jsonError } from '@/lib/server';

const body = z.object({ code: z.string().min(4).max(32) });

// Slow brute force down. The code has ~40 bits of entropy, so this is belt and braces.
const attempts = new Map<string, { n: number; until: number }>();

/** Exchanges the setup code from the logs for a short-lived cookie that allows the first Plex sign-in. */
export const POST = handle(async (req: NextRequest) => {
  const d = db();
  if (hasOwner(d)) return jsonError(409, 'Playbill is already set up. Sign in with Plex instead.');
  ensureSetupCode(d);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.until > now && a.n >= 10) return jsonError(429, 'Too many attempts. Wait 15 minutes.');

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !checkSetupCode(d, parsed.data.code)) {
    attempts.set(ip, { n: (a && a.until > now ? a.n : 0) + 1, until: now + 15 * 60_000 });
    return jsonError(401, "That code doesn't match. Copy it from the Playbill logs or setup-code.txt.");
  }
  attempts.delete(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SETUP_COOKIE, crypto().sign('setup', instanceClientId(d)), {
    httpOnly: true,
    sameSite: 'lax',
    secure: await isHttps(),
    path: '/',
    maxAge: 3600,
  });
  return res;
});
