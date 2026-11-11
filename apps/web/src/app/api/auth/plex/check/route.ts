import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { audit } from '@playbill/core/audit';
import { createSession, findAdmin, hasOwner, upsertAdmin } from '@playbill/core/auth';
import { checkPin, getAccount, getServers } from '@playbill/core/clients/plextv';
import { crypto } from '@playbill/core/crypto';
import { instanceClientId, setSetting } from '@playbill/core/settings';
import { advanceSetup, clearSetupCode } from '@playbill/core/setup';
import { SETUP_COOKIE, db, handle, jsonError, setSessionCookie } from '@/lib/server';

const body = z.object({ id: z.number().int() });

/**
 * Polled by the browser while the user approves the PIN on app.plex.tv.
 * - Not approved yet → { pending: true }
 * - First run (no owner): needs the setup cookie and a Plex account that owns a server; it becomes the owner.
 * - Otherwise: only accounts already listed as admins get in.
 */
export const POST = handle(async (req: NextRequest) => {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Missing PIN id');
  const d = db();
  const clientId = instanceClientId(d);

  const token = await checkPin(clientId, parsed.data.id);
  if (!token) return NextResponse.json({ pending: true });

  const account = await getAccount(clientId, token);
  const plexUserId = String(account.id);
  const profile = {
    plexUserId,
    username: account.username || account.title || 'Plex user',
    email: account.email ?? null,
    thumb: account.thumb ?? null,
  };

  let next = '/';
  if (!hasOwner(d)) {
    const setupCookie = req.cookies.get(SETUP_COOKIE)?.value;
    if (!setupCookie || !crypto().verify('setup', clientId, setupCookie)) {
      return jsonError(403, 'Enter the setup code first.');
    }
    const owned = (await getServers(clientId, token)).filter((s) => s.owned);
    if (owned.length === 0) {
      return jsonError(403, `${profile.username} doesn't own a Plex Media Server. Sign in with the server owner's account.`);
    }
    d.transaction(() => {
      upsertAdmin(d, { ...profile, role: 'owner' });
      setSetting(d, 'owner', { plexUserId, username: profile.username, tokenEnc: crypto().encrypt(token) });
      advanceSetup(d, 2);
      clearSetupCode(d);
    });
    audit(d, { actor: profile.username, action: 'setup.owner', target: plexUserId });
    next = '/setup';
  } else {
    const admin = findAdmin(d, plexUserId);
    if (!admin) return jsonError(403, `${profile.username} isn't allowed into this Playbill.`);
    upsertAdmin(d, { ...profile, role: admin.role });
    // The owner's token can change (e.g. password reset); keep the stored one current.
    if (admin.role === 'owner') {
      setSetting(d, 'owner', { plexUserId, username: profile.username, tokenEnc: crypto().encrypt(token) });
    }
  }

  const res = NextResponse.json({ ok: true, next });
  await setSessionCookie(res, createSession(d, plexUserId, req.headers.get('user-agent')));
  res.cookies.delete(SETUP_COOKIE);
  return res;
});
