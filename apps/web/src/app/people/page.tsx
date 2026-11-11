import { listPeople, weeklyMarks } from '@playbill/core/insights';
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

  return (
    <Shell admin={admin} server={serverName()}>
      <header className="max-w-[70ch]">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[2.25rem]">People</h1>
        <p className="mt-2 text-ink-2">
          Everyone who has, or had, access to your server, with the last 12 weeks of watching. Open anyone for their full year.
        </p>
      </header>
      <div className="mt-8">
        <PeopleTable
          now={now}
          tz={timezone()}
          initialStatus={status}
          rows={rows.map((r) => ({ ...r, marks: marks.get(r.id) ?? [] }))}
        />
      </div>
    </Shell>
  );
}
