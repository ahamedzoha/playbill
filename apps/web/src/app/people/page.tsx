import { listPeople, weeklyMarks } from '@playbill/core/insights';
import { awaitingRemovals } from '@playbill/core/lifecycle';
import Link from 'next/link';
import { ApprovalRow } from '@/components/access-controls';
import { daysAgo, longDate } from '@/lib/format';
import { PeopleTable } from '@/components/people-table';
import { Shell } from '@/components/shell';
import { db, requireAdmin, serverName, timezone } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'People' };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const d = db();
  const now = Date.now();
  const rows = listPeople(d, now);
  const marks = weeklyMarks(d, rows.map((r) => r.id), now, 12);
  const status = typeof params.status === 'string' ? params.status : 'all';
  const approvals = awaitingRemovals(d);
  const tz = timezone();

  return (
    <Shell admin={admin} server={serverName()}>
      <header className="max-w-[70ch]">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[2.25rem]">People</h1>
        <p className="mt-2 text-ink-2">
          Everyone who has, or had, access to your server, with the last 12 weeks of watching. Open anyone for their full year.
        </p>
      </header>
      {approvals.length > 0 && (
        <section id="approvals" aria-labelledby="approvals-h" className="mt-8 rounded-xl border border-red/40 bg-sheet">
          <div className="px-5 pt-5 pb-3 sm:px-6">
            <h2 id="approvals-h" className="text-lg font-semibold tracking-[-0.01em] text-red">
              Waiting for your approval
            </h2>
            <p className="mt-1 max-w-[70ch] text-sm text-ink-2">
              These people were warned and still haven't watched anything. Nothing happens until you decide. Removing access can be undone by re-inviting them, but they'll have to accept again.
            </p>
          </div>
          <ul className="divide-y divide-rule border-t border-rule-strong">
            {approvals.map(({ action, person }) => (
              <li key={action.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <span className="min-w-0">
                  <Link href={`/people/${encodeURIComponent(person.plexUserId)}`} className="font-medium hover:underline">
                    {person.displayName}
                  </Link>
                  <span className="block text-sm text-ink-3">
                    Last watched {daysAgo(person.lastPlayedAt, now)} · proposed {longDate(action.createdAt, tz)}
                  </span>
                </span>
                <ApprovalRow actionId={action.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-8">
        <PeopleTable
          now={now}
          tz={tz}
          initialStatus={status}
          rows={rows.map((r) => ({ ...r, marks: marks.get(r.id) ?? [] }))}
        />
      </div>
    </Shell>
  );
}
