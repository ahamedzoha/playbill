'use server';

import { eq } from 'drizzle-orm';
import { audit } from '@playbill/core/audit';
import { people } from '@playbill/core/db/schema';
import { readPreferenceToken } from '@playbill/core/links';
import { TOPICS, setPreference, suppress, unsuppressIfUnsubscribed } from '@playbill/core/topics';
import { db } from '@/lib/server';

export interface PrefState {
  ok: boolean;
  message: string;
}

/** Saves a recipient's choices. The signed token in the link is the only credential needed. */
export async function savePreferences(_prev: PrefState | null, form: FormData): Promise<PrefState> {
  const id = readPreferenceToken(String(form.get('token') ?? ''));
  if (!id) return { ok: false, message: "This link isn't valid any more." };
  if (id === 'test') return { ok: true, message: 'This was a test email, so nothing changed.' };
  const d = db();
  const person = d.select().from(people).where(eq(people.plexUserId, id)).get();
  if (!person) return { ok: false, message: "We couldn't find your details." };

  const all = form.get('action') === 'none';
  const chosen = Object.fromEntries(TOPICS.map((t) => [t.id, !all && form.get(`topic:${t.id}`) === 'on']));
  for (const t of TOPICS) setPreference(d, id, t.id, chosen[t.id]!, 'recipient');
  if (person.email) {
    if (all) suppress(d, person.email, 'unsubscribed', 'Chose "no emails" on the preferences page');
    else unsuppressIfUnsubscribed(d, person.email);
  }
  audit(d, { actor: 'recipient', action: 'preferences.update', target: id, after: chosen });
  return { ok: true, message: all ? "Done. You won't get any more emails from us." : 'Saved. Thanks for letting us know.' };
}
