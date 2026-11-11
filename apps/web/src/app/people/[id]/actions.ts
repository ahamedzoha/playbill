'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { audit } from '@playbill/core/audit';
import { people } from '@playbill/core/db/schema';
import { currentAdmin, db } from '@/lib/server';

export interface SaveState {
  ok: boolean;
  message: string;
}

/** Saves the Playbill-only fields: the owner's note and the exempt flag. Nothing is sent to Plex. */
export async function savePerson(_prev: SaveState | null, form: FormData): Promise<SaveState> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, message: 'Your session ended. Sign in again.' };
  const id = String(form.get('id') ?? '');
  const note = String(form.get('note') ?? '').trim().slice(0, 1000) || null;
  const exempt = form.get('exempt') === 'on';
  const d = db();
  const before = d.select({ note: people.note, exempt: people.exempt }).from(people).where(eq(people.plexUserId, id)).get();
  if (!before) return { ok: false, message: 'This person is no longer in Playbill.' };
  d.update(people).set({ note, exempt }).where(eq(people.plexUserId, id)).run();
  audit(d, { actor: admin.username, action: 'person.update', target: id, before, after: { note, exempt } });
  revalidatePath(`/people/${encodeURIComponent(id)}`);
  revalidatePath('/people');
  revalidatePath('/');
  return { ok: true, message: 'Saved' };
}

// ---------------------------------------------------------------------------------------------
// Access and housekeeping. Every change to plex.tv is audited; removals go through the worker.

import { changeLibraries, decideRemoval, nudgeNow, reinvite, withdrawInvite } from '@playbill/core/lifecycle';
import { Queue } from '@playbill/core/queue';
import { currentOwner } from '@/lib/server';

async function ownerName(): Promise<string> {
  const o = await currentOwner();
  if (!o) throw new Error('Only the server owner can change access.');
  return o.username;
}

function done(message: string, paths: string[] = []): SaveState {
  for (const p of paths) revalidatePath(p);
  revalidatePath('/people');
  revalidatePath('/');
  return { ok: true, message };
}

const failed = (err: unknown): SaveState => ({ ok: false, message: err instanceof Error ? err.message : String(err) });

export async function nudgePerson(id: string): Promise<SaveState> {
  try {
    const actor = await ownerName();
    nudgeNow(db(), id, actor);
    new Queue(db()).enqueue('lifecycle.send', {}, { dedupeKey: 'lifecycle.send' });
    return done('Nudge on its way.', [`/people/${encodeURIComponent(id)}`]);
  } catch (err) {
    return failed(err);
  }
}

/** Removal (approve a proposal, or start one from the person page). Runs in the worker. */
export async function approveRemoval(input: { actionId?: string; plexUserId?: string }): Promise<SaveState> {
  try {
    const actor = await ownerName();
    const a = decideRemoval(db(), { ...input, approve: true }, actor);
    new Queue(db()).enqueue('lifecycle.remove', { actionId: a.id }, { dedupeKey: `remove:${a.id}` });
    return done('Removing their access. This takes a few seconds.', [`/people/${encodeURIComponent(a.plexUserId)}`]);
  } catch (err) {
    return failed(err);
  }
}

export async function keepPerson(actionId: string, exempt: boolean): Promise<SaveState> {
  try {
    const actor = await ownerName();
    const a = decideRemoval(db(), { actionId, approve: false, exempt }, actor);
    return done(exempt ? 'Kept, and marked exempt.' : 'Kept.', [`/people/${encodeURIComponent(a.plexUserId)}`]);
  } catch (err) {
    return failed(err);
  }
}

export async function reinvitePerson(id: string): Promise<SaveState> {
  try {
    await reinvite(db(), id, await ownerName());
    new Queue(db()).enqueue('sync.people', {}, { dedupeKey: 'schedule:sync.people' });
    return done('Invite sent. They need to accept it in Plex.', [`/people/${encodeURIComponent(id)}`]);
  } catch (err) {
    return failed(err);
  }
}

export async function saveLibraries(id: string, sectionKeys: string[]): Promise<SaveState> {
  try {
    await changeLibraries(db(), id, sectionKeys, await ownerName());
    return done('Libraries updated.', [`/people/${encodeURIComponent(id)}`]);
  } catch (err) {
    return failed(err);
  }
}

export async function withdrawPersonInvite(id: string): Promise<SaveState> {
  try {
    await withdrawInvite(db(), id, await ownerName());
    return done('Invite withdrawn.');
  } catch (err) {
    return failed(err);
  }
}
