import { NextResponse } from 'next/server';
import { getServers, rankConnections } from '@playbill/core/clients/plextv';
import { ownerCredentials } from '@playbill/core/owner';
import { currentOwner, db, handle, jsonError } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Plex Media Servers the owner runs, with the connections plex.tv knows about. */
export const GET = handle(async () => {
  if (!(await currentOwner())) return jsonError(403, 'Only the server owner can do this.');
  const creds = ownerCredentials(db());
  if (!creds) return jsonError(409, 'Sign in with Plex first.');
  const servers = (await getServers(creds.clientId, creds.token)).filter((s) => s.owned);
  return NextResponse.json({
    servers: servers.map((s) => ({
      machineId: s.clientIdentifier,
      name: s.name,
      connections: rankConnections(s.connections).map((c) => ({ uri: c.uri, local: c.local, relay: c.relay })),
    })),
  });
});
