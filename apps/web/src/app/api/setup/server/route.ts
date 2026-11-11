import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { audit } from '@playbill/core/audit';
import { findWorkingConnection, getServers } from '@playbill/core/clients/plextv';
import { ownerCredentials } from '@playbill/core/owner';
import { setSetting } from '@playbill/core/settings';
import { advanceSetup } from '@playbill/core/setup';
import { currentOwner, db, handle, jsonError } from '@/lib/server';

const body = z.object({
  machineId: z.string().min(1),
  /** Optional address typed by the user, e.g. http://192.168.1.36:32400. Tried first. */
  manualUrl: z.string().url().optional().or(z.literal('')),
});

/** Picks the Plex server and the first connection that actually answers from this container. */
export const POST = handle(async (req: NextRequest) => {
  const owner = await currentOwner();
  if (!owner) return jsonError(403, 'Only the server owner can do this.');
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Choose a server.');
  const d = db();
  const creds = ownerCredentials(d);
  if (!creds) return jsonError(409, 'Sign in with Plex first.');

  const server = (await getServers(creds.clientId, creds.token)).find(
    (s) => s.owned && s.clientIdentifier === parsed.data.machineId,
  );
  if (!server) return jsonError(404, 'That server is not on your Plex account.');

  const extra = parsed.data.manualUrl ? [parsed.data.manualUrl.replace(/\/+$/, '')] : [];
  try {
    const { url, tried } = await findWorkingConnection(server, server.accessToken ?? creds.token, extra);
    setSetting(d, 'plex', { machineId: server.clientIdentifier, name: server.name, url });
    advanceSetup(d, 3);
    audit(d, { actor: owner.username, action: 'setup.server', target: server.clientIdentifier, after: { name: server.name, url } });
    return NextResponse.json({ ok: true, url, tried });
  } catch (err) {
    const tried = (err as { tried?: unknown }).tried ?? [];
    return jsonError(
      502,
      `Playbill couldn't reach ${server.name} at any address. Enter the address this container can reach (for example http://192.168.1.10:32400).`,
      { tried },
    );
  }
});
