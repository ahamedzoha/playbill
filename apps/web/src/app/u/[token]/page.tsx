import { eq } from 'drizzle-orm';
import { people } from '@playbill/core/db/schema';
import { readPreferenceToken } from '@playbill/core/links';
import { TOPICS, isTopic, suppression, topicPreferences } from '@playbill/core/topics';
import { PreferencesForm } from '@/components/preferences-form';
import { Wordmark } from '@/components/shell';
import { db, serverName } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email preferences', robots: { index: false } };

/**
 * The page links in emails open. Viewing it changes nothing: link scanners open URLs before people
 * do, so unsubscribing always takes a press of a button.
 */
export default async function PreferencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const id = readPreferenceToken(token);
  const server = serverName();
  const highlight = typeof sp.unsubscribe === 'string' && isTopic(sp.unsubscribe) ? sp.unsubscribe : null;
  const d = db();
  const person = id && id !== 'test' ? d.select().from(people).where(eq(people.plexUserId, id)).get() : null;
  const current = person ? topicPreferences(d, person.plexUserId) : Object.fromEntries(TOPICS.map((t) => [t.id, true]));
  const allOff = person?.email ? suppression(d, person.email)?.reason === 'unsubscribed' : false;

  return (
    <div className="min-h-dvh">
      <header className="bg-rail px-5 py-4 text-rail-ink">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <span className="font-semibold">{server}</span>
          <span className="text-sm text-rail-ink-2">Email preferences</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-5 py-10">
        {!id ? (
          <p className="text-lg">This link isn't valid. Use the link from the most recent email you got from {server}.</p>
        ) : (
          <>
            <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em]">
              {person ? `Hi ${person.displayName.split(/\s+/)[0]}, what would you like to hear about?` : 'Email preferences'}
            </h1>
            <p className="mt-3 text-ink-2">
              {id === 'test'
                ? 'This link came from a test email, so it isn’t tied to anyone. Real emails open your own choices here.'
                : allOff
                  ? `You've turned off all emails from ${server}. Tick anything you'd like back.`
                  : `These are the emails ${server} can send you. Untick anything you don't want.`}
            </p>
            <div className="mt-8">
              <PreferencesForm
                token={token}
                topics={TOPICS.map((t) => ({ id: t.id, label: t.label, description: t.description }))}
                current={allOff ? Object.fromEntries(TOPICS.map((t) => [t.id, false])) : current}
                highlight={highlight}
              />
            </div>
          </>
        )}
        <div className="mt-16 flex items-center gap-2 text-xs text-ink-3 [&_span]:text-sm">
          <span className="sr-only">Sent with</span>
          <span className="scale-75 opacity-70">
            <Wordmark />
          </span>
        </div>
      </main>
    </div>
  );
}
