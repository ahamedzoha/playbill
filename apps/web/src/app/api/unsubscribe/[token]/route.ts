import { eq } from 'drizzle-orm';
import { audit } from '@playbill/core/audit';
import { people } from '@playbill/core/db/schema';
import { readPreferenceToken } from '@playbill/core/links';
import { isTopic, setPreference } from '@playbill/core/topics';
import { db } from '@/lib/server';

/**
 * RFC 8058 one-click unsubscribe. Mail apps POST here when someone taps "Unsubscribe" in the inbox.
 * POST only: link scanners follow GET links, and a GET must never unsubscribe anyone.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = readPreferenceToken(token);
  const topic = new URL(req.url).searchParams.get('topic') ?? 'digest';
  if (!id || !isTopic(topic)) return new Response('Not found', { status: 404 });
  if (id === 'test') return new Response('OK');
  const d = db();
  if (!d.select({ id: people.plexUserId }).from(people).where(eq(people.plexUserId, id)).get()) return new Response('Not found', { status: 404 });
  setPreference(d, id, topic, false, 'recipient');
  audit(d, { actor: 'recipient', action: 'preferences.one-click', target: id, after: { topic, subscribed: false } });
  return new Response('Unsubscribed');
}
