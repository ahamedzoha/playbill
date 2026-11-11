import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { overview, peakHours, weeklyMarks, weeklyTotals } from '@playbill/core/insights';
import { ActiveHistory, PeakGrid, WeeklyBars } from '@/components/charts';
import { Avatar } from '@/components/avatar';
import { RangeControl, parseRange } from '@/components/range-control';
import { RegisterHeader, RegisterKey, RegisterStrip } from '@/components/register-strip';
import { withJoin } from '@/lib/register';
import { Shell } from '@/components/shell';
import { Status } from '@/components/status';
import { daysAgo, hourLabel, plural } from '@/lib/format';
import { db, requireAdmin, serverName, timezone } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview' };

const SHOWN = 10;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const range = parseRange((await searchParams).range);
  const d = db();
  const tz = timezone();
  const now = Date.now();
  const o = overview(d, now, range, tz);
  const shown = o.attention.slice(0, SHOWN);
  const marks = weeklyMarks(d, shown.map((p) => p.id), now, 12);
  const grid = peakHours(d, now, 90, tz);
  const weeks = weeklyTotals(d, now, 12);

  const diff = o.watched - o.watchedBefore;
  const span = range === 7 ? '7 days' : `${range} days`;
  const change =
    diff === 0 ? `the same as the ${span} before` : `${Math.abs(diff)} ${diff > 0 ? 'more' : 'fewer'} than the ${span} before`;
  const DAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

  return (
    <Shell admin={admin} server={serverName()}>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <h1 className="max-w-[30ch] text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.025em] text-balance sm:text-[2.25rem]">
            <span className="num">{o.watched}</span> of <span className="num">{o.audience}</span> people watched in the last {span}
          </h1>
          <p className="num mt-3 max-w-[70ch] text-ink-2">
            {change[0]!.toUpperCase() + change.slice(1)} · {plural(o.plays, 'play', 'plays')} ·{' '}
            {plural(Math.round(o.hours), 'hour', 'hours')}
            {o.busiest && (
              <>
                {' '}
                · busiest on {DAYS[o.busiest.weekday]} around {hourLabel(o.busiest.hour)}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="mb-1.5 text-xs text-ink-3">People watching each week</p>
            <ActiveHistory weeks={o.weeklyActive} total={o.audience} tz={tz} />
          </div>
          <RangeControl value={range} basePath="/" />
        </div>
      </header>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-labelledby="checkin" className="min-w-0 rounded-xl border border-rule bg-sheet">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
            <h2 id="checkin" className="text-lg font-semibold tracking-[-0.01em]">
              People to check on
            </h2>
            <RegisterKey />
          </div>
          {shown.length === 0 ? (
            <p className="border-t border-rule px-6 py-10 text-ink-2">Everyone with access watched in the last month.</p>
          ) : (
            <table className="w-full text-left">
              <thead className="border-y border-rule-strong">
                <tr className="caps text-ink-3">
                  <th scope="col" className="py-2.5 pr-3 pl-5 font-semibold sm:pl-6">
                    Person
                    <RegisterHeader weeks={o.weeklyActive} tz={tz} className="mt-2 ml-11 [--mark:13px] sm:hidden" />
                  </th>
                  <th scope="col" className="hidden py-2.5 pr-3 font-semibold md:table-cell">
                    Status
                  </th>
                  <th scope="col" className="hidden py-2 pr-3 align-bottom font-semibold sm:table-cell">
                    <span className="sr-only">Last 12 weeks</span>
                    <RegisterHeader weeks={o.weeklyActive} tz={tz} className="[--mark:12px]" />
                  </th>
                  <th scope="col" className="hidden py-2.5 pr-6 font-semibold lg:table-cell">
                    Last watched
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="group border-b border-rule last:border-b-0 hover:bg-paper/60">
                    <td className="py-3 pr-3 pl-5 sm:pl-6">
                      <Link href={`/people/${encodeURIComponent(p.id)}`} className="flex min-w-0 items-center gap-3 outline-offset-4">
                        <Avatar name={p.displayName} thumb={p.thumb} size={32} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium group-hover:underline">{p.displayName}</span>
                          <span className="block md:hidden">
                            <Status segment={p.segment} />
                          </span>
                        </span>
                      </Link>
                      <div className="mt-2.5 pl-11 sm:hidden">
                        <RegisterStrip
                          cells={withJoin(marks.get(p.id) ?? [], p.joinedAt)}
                          tz={tz}
                          size={12}
                          className="[--mark:13px]"
                          label={`${p.displayName}: watched in ${(marks.get(p.id) ?? []).filter((c) => c.level > 0).length} of the last 12 weeks`}
                        />
                      </div>
                    </td>
                    <td className="hidden py-3 pr-3 md:table-cell">
                      <Status segment={p.segment} exempt={p.exempt} />
                    </td>
                    <td className="hidden py-3 pr-3 sm:table-cell">
                      <RegisterStrip
                        cells={withJoin(marks.get(p.id) ?? [], p.joinedAt)}
                        tz={tz}
                        size={12}
                        className="[--mark:12px]"
                        animateKey={String(range)}
                        label={`${p.displayName}: watched in ${(marks.get(p.id) ?? []).filter((c) => c.level > 0).length} of the last 12 weeks`}
                      />
                    </td>
                    <td className="hidden py-3 pr-6 text-sm lg:table-cell">
                      <span className="block text-ink">{daysAgo(p.lastPlayedAt, now)}</span>
                      <span className="block max-w-[22ch] truncate text-ink-3">{p.lastTitle ?? '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {o.attention.length > SHOWN && (
            <div className="border-t border-rule px-5 py-3 sm:px-6">
              <Link href="/people?status=attention" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue hover:underline">
                See all {o.attention.length} in People <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>

        <section aria-labelledby="housekeeping" className="order-first rounded-xl border border-rule bg-sheet xl:order-none">
          <h2 id="housekeeping" className="px-5 pt-5 pb-4 text-lg font-semibold tracking-[-0.01em]">
            Housekeeping
          </h2>
          {o.housekeeping.length === 0 ? (
            <p className="border-t border-rule px-5 py-8 text-ink-2">Nothing needs you this week.</p>
          ) : (
            <ul className="border-t border-rule-strong">
              {o.housekeeping.map((h) => (
                <li key={h.id} className="flex gap-3 border-b border-rule px-5 py-4 last:border-b-0">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 block size-2.5 shrink-0 rounded-[3px]"
                    style={
                      h.decision
                        ? { background: 'var(--red)' }
                        : { border: '1.5px solid var(--mark-2)' }
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className={h.decision ? 'font-medium text-ink' : 'text-ink'}>
                      {h.decision && <span className="sr-only">Needs your decision: </span>}
                      {h.text}
                    </p>
                    <Link
                      href={h.action.href}
                      className={`mt-1.5 inline-flex items-center gap-1 text-sm font-medium hover:underline ${h.decision ? 'text-red' : 'text-blue'}`}
                    >
                      {h.action.label} <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-rule px-5 py-3 text-xs text-ink-3">
            {o.lastSyncAt ? `Watch history synced ${daysAgo(o.lastSyncAt, now) === 'today' ? minutesAgo(o.lastSyncAt, now) : daysAgo(o.lastSyncAt, now)}` : 'Watch history not synced yet'}
          </p>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section aria-labelledby="peak" className="rounded-xl border border-rule bg-sheet p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 id="peak" className="text-lg font-semibold tracking-[-0.01em]">
              When people watch
            </h2>
            <span className="text-xs text-ink-3">Last 90 days</span>
          </div>
          <PeakGrid grid={grid} days={90} />
        </section>
        <section aria-labelledby="weekly" className="rounded-xl border border-rule bg-sheet p-5 sm:p-6">
          <div className="mb-7 flex items-baseline justify-between gap-3">
            <h2 id="weekly" className="text-lg font-semibold tracking-[-0.01em]">
              Hours watched each week
            </h2>
            <span className="text-xs text-ink-3">Last 12 weeks</span>
          </div>
          <WeeklyBars weeks={weeks} tz={tz} />
        </section>
      </div>
    </Shell>
  );
}

function minutesAgo(ts: number, now: number): string {
  const m = Math.round((now - ts) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}
