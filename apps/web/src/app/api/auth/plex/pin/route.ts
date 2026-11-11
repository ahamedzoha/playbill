import { NextResponse } from 'next/server';
import { authUrl, createPin } from '@playbill/core/clients/plextv';
import { instanceClientId } from '@playbill/core/settings';
import { db, handle } from '@/lib/server';

/** Starts Plex sign-in: returns a PIN id to poll and the app.plex.tv page to approve it on. */
export const POST = handle(async () => {
  const clientId = instanceClientId(db());
  const pin = await createPin(clientId);
  return NextResponse.json({ id: pin.id, url: authUrl(clientId, pin.code) });
});
