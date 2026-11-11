import { crypto } from './crypto';
import type { Db } from './db';
import { getSetting, instanceClientId } from './settings';

/** The owner's plex.tv token and this install's client id, for calls made on the owner's behalf. */
export function ownerCredentials(db: Db): { clientId: string; token: string } | null {
  const owner = getSetting(db, 'owner');
  if (!owner) return null;
  return { clientId: instanceClientId(db), token: crypto().decrypt(owner.tokenEnc) };
}
