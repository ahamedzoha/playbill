import { and, eq } from 'drizzle-orm';
import type { Db } from './db';
import { preferences, suppressions } from './db/schema';

/** What people can opt out of, one switch each. */
export const TOPICS = [
  { id: 'digest', label: 'Weekly digest', description: "What's new on the server each week, and what's coming." },
  { id: 'arrivals', label: 'New arrivals', description: 'A note when something you follow, or asked for, is ready to watch.' },
  { id: 'leaving', label: 'Leaving soon', description: "A heads-up before something you started is removed." },
  { id: 'recap', label: 'Monthly recap', description: 'Your own month of watching, once a month.' },
  { id: 'account', label: 'Account notices', description: 'Notes about your access to the server.' },
] as const;

export type TopicId = (typeof TOPICS)[number]['id'];

export function isTopic(id: string): id is TopicId {
  return TOPICS.some((t) => t.id === id);
}

export function topicPreferences(db: Db, plexUserId: string): Record<TopicId, boolean> {
  const rows = db.select().from(preferences).where(eq(preferences.plexUserId, plexUserId)).all();
  const out = Object.fromEntries(TOPICS.map((t) => [t.id, true])) as Record<TopicId, boolean>;
  for (const r of rows) if (isTopic(r.topic)) out[r.topic] = r.subscribed;
  return out;
}

export function setPreference(
  db: Db,
  plexUserId: string,
  topic: TopicId,
  subscribed: boolean,
  source: 'recipient' | 'owner',
  now = Date.now(),
): void {
  db.insert(preferences)
    .values({ plexUserId, topic, subscribed, updatedAt: now, source })
    .onConflictDoUpdate({ target: [preferences.plexUserId, preferences.topic], set: { subscribed, updatedAt: now, source } })
    .run();
}

export function normalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function suppression(db: Db, email: string) {
  return db.select().from(suppressions).where(eq(suppressions.email, normalEmail(email))).get() ?? null;
}

export function suppress(db: Db, email: string, reason: (typeof suppressions.$inferSelect)['reason'], detail?: string): void {
  const row = { email: normalEmail(email), reason, detail: detail ?? null, at: Date.now() };
  db.insert(suppressions).values(row).onConflictDoUpdate({ target: suppressions.email, set: row }).run();
}

/** Re-subscribing to everything lifts an unsubscribe-all, but never a bounce or complaint. */
export function unsuppressIfUnsubscribed(db: Db, email: string): void {
  db.delete(suppressions)
    .where(and(eq(suppressions.email, normalEmail(email)), eq(suppressions.reason, 'unsubscribed')))
    .run();
}
