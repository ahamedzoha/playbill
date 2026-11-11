'use server';

import { revalidatePath } from 'next/cache';
import { planLeaving, setLeavingStatus } from '@playbill/core/library';
import { Queue } from '@playbill/core/queue';
import { currentOwner, db } from '@/lib/server';

export interface LibState {
  ok: boolean;
  message: string;
}

async function owner() {
  const o = await currentOwner();
  if (!o) throw new Error('Only the server owner can do this.');
  return o.username;
}

export async function planRemoval(keys: string[], removeOn: string, noticeDays: number): Promise<LibState> {
  try {
    const actor = await owner();
    const removeAt = Date.parse(`${removeOn}T12:00:00`);
    if (!keys.length) return { ok: false, message: 'Select at least one title.' };
    if (!Number.isFinite(removeAt) || removeAt < Date.now() + 86_400_000) return { ok: false, message: 'Pick a date at least a day from now.' };
    const n = planLeaving(db(), keys, removeAt, noticeDays, actor);
    new Queue(db()).enqueue('leaving.check', {}, { dedupeKey: 'leaving.check' });
    revalidatePath('/library');
    return { ok: true, message: `${n} ${n === 1 ? 'title' : 'titles'} planned. People who watched ${n === 1 ? 'it' : 'them'} hear ${noticeDays} days before.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function markLeaving(key: string, status: 'removed' | 'cancelled'): Promise<LibState> {
  try {
    setLeavingStatus(db(), key, status, await owner());
    revalidatePath('/library');
    revalidatePath('/');
    return { ok: true, message: status === 'removed' ? 'Marked as removed.' : 'Kept.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function refreshLibrary(): Promise<LibState> {
  try {
    await owner();
    new Queue(db()).enqueue('sync.library', {}, { dedupeKey: 'sync.library' });
    return { ok: true, message: 'Refreshing; reload in a minute.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
