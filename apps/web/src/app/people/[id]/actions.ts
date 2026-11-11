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
