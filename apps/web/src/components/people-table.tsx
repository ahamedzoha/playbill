'use client';

import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import type { PersonRow } from '@playbill/core/insights';
import type { Segment } from '@playbill/core/people/segments';
import { daysAgo, hours, shortDate } from '@/lib/format';
import { Avatar } from './avatar';
import { type StripCell, withJoin } from '@/lib/register';
import { RegisterHeader, RegisterKey, RegisterStrip } from './register-strip';
import { Status, StatusMark, segmentLabel } from './status';

type Row = PersonRow & { marks: StripCell[] };
type SortKey = 'name' | 'last' | 'plays' | 'hours' | 'since';

const FILTERS: { id: string; label: string; segments: Segment[] | null }[] = [
  { id: 'all', label: 'Everyone', segments: null },
  { id: 'active', label: 'Active', segments: ['active'] },
  { id: 'new', label: 'New', segments: ['new'] },
  { id: 'cooling', label: 'Slowing down', segments: ['cooling'] },
  { id: 'dormant', label: 'Gone quiet', segments: ['dormant'] },
  { id: 'inactive', label: 'Inactive 6+ months', segments: ['inactive'] },
  { id: 'never', label: 'Never watched', segments: ['never'] },
  { id: 'pending', label: 'Invite pending', segments: ['pending'] },
  { id: 'removed', label: 'Removed', segments: ['removed'] },
];
// Linked from the Overview: everyone who is slipping, in one view.
const ATTENTION: Segment[] = ['cooling', 'dormant', 'inactive', 'never'];

function matches(filter: string, s: Segment): boolean {
  if (filter === 'attention') return ATTENTION.includes(s);
  const f = FILTERS.find((x) => x.id === filter);
  return !f?.segments || f.segments.includes(s);
}

export function PeopleTable({ rows, now, tz, initialStatus }: { rows: Row[]; now: number; tz: string; initialStatus: string }) {
  const [filter, setFilter] = useState(FILTERS.some((f) => f.id === initialStatus) || initialStatus === 'attention' ? initialStatus : 'all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'last', dir: -1 });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.id] = rows.filter((r) => matches(f.id, r.segment)).length;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        matches(filter, r.segment) &&
        (!q || r.displayName.toLowerCase().includes(q) || r.username.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q)),
    );
    const val = (r: Row): number | string => {
      switch (sort.key) {
        case 'name':
          return r.displayName.toLowerCase();
        case 'last':
          return r.lastPlayedAt ?? -1;
        case 'plays':
          return r.plays;
        case 'hours':
          return r.hours;
        case 'since':
          return r.since ?? 0;
      }
    };
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, filter, query, sort]);

  function choose(id: string) {
    setFilter(id);
    const url = new URL(window.location.href);
    if (id === 'all') url.searchParams.delete('status');
    else url.searchParams.set('status', id);
    window.history.replaceState(null, '', url);
  }

  function header(key: SortKey, label: string, className = '', extra?: ReactNode) {
    const active = sort.key === key;
    const Icon = sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={`py-2.5 pr-3 font-semibold ${className}`}>
        <button
          type="button"
          onClick={() => setSort(active ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 })}
          className={`caps inline-flex items-center gap-1 ${active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}
        >
          {label}
          {active && <Icon size={12} aria-hidden="true" />}
        </button>
        {extra}
      </th>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="Filter by status" className="-mx-1 flex flex-wrap gap-1.5">
          {(filter === 'attention' ? [{ id: 'attention', label: 'Slipping away', segments: ATTENTION }, ...FILTERS] : FILTERS).map((f) => {
            const n = f.id === 'attention' ? rows.filter((r) => ATTENTION.includes(r.segment)).length : counts[f.id];
            if (!n && f.id !== 'all' && f.id !== filter) return null;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => choose(f.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active ? 'border-rail bg-rail text-rail-ink' : 'border-rule bg-sheet text-ink-2 hover:border-rule-strong hover:text-ink'
                }`}
              >
                {f.segments?.length === 1 && <StatusMark segment={f.segments[0]!} size={10} />}
                {f.label}
                <span className={`num ${active ? 'text-rail-ink-2' : 'text-ink-3'}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <label className="relative block sm:w-80">
          <span className="sr-only">Search people</span>
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email"
            className="w-full rounded-lg border border-rule bg-sheet py-2 pr-3 pl-9 text-sm placeholder:text-ink-3 focus:border-blue focus:outline-none"
          />
        </label>
      </div>

      <section className="rounded-xl border border-rule bg-sheet">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <p className="text-sm text-ink-2">
            <span className="num font-medium text-ink">{visible.length}</span> {visible.length === 1 ? 'person' : 'people'}
            {filter !== 'all' && <> · {filter === 'attention' ? 'slipping away' : segmentLabel(FILTERS.find((f) => f.id === filter)!.segments![0]!).toLowerCase()}</>}
          </p>
          <RegisterKey showBefore />
        </div>
        {visible.length === 0 ? (
          <p className="border-t border-rule px-6 py-12 text-center text-ink-2">
            Nobody matches{query ? ` "${query}"` : ' this filter'}.{' '}
            <button type="button" className="font-medium text-blue hover:underline" onClick={() => { setQuery(''); choose('all'); }}>
              Show everyone
            </button>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-left">
              <thead className="border-y border-rule-strong">
                <tr>
                  {header('name', 'Person', 'pl-5 sm:pl-6', <RegisterHeader weeks={rows[0]?.marks ?? []} tz={tz} className="mt-2 ml-[2.875rem] [--mark:13px] sm:hidden" />)}
                  <th scope="col" className="caps hidden py-2.5 pr-3 font-semibold text-ink-3 lg:table-cell">
                    Status
                  </th>
                  <th scope="col" className="hidden py-2 pr-3 align-bottom font-semibold sm:table-cell">
                    <span className="sr-only">Last 12 weeks</span>
                    <RegisterHeader weeks={rows[0]?.marks ?? []} tz={tz} className="[--mark:12px]" />
                  </th>
                  {header('last', 'Last watched', 'hidden md:table-cell')}
                  {header('plays', 'Plays', 'hidden text-right xl:table-cell')}
                  {header('hours', 'Hours', 'hidden text-right xl:table-cell')}
                  <th scope="col" className="caps hidden py-2.5 pr-3 font-semibold text-ink-3 2xl:table-cell">
                    Libraries
                  </th>
                  {header('since', 'Since', 'hidden pr-6 2xl:table-cell')}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const watchedWeeks = r.marks.filter((m) => m.level > 0).length;
                  const gone = r.segment === 'removed' || r.segment === 'pending';
                  return (
                    <tr key={r.id} className="group border-b border-rule last:border-b-0 hover:bg-paper/60">
                      <td className="py-3 pr-3 pl-5 sm:pl-6">
                        <Link href={`/people/${encodeURIComponent(r.id)}`} className="flex min-w-0 items-center gap-3 outline-offset-4">
                          <Avatar name={r.displayName} thumb={r.thumb} size={34} muted={gone} />
                          <span className="min-w-0">
                            <span className="block max-w-[24ch] truncate font-medium group-hover:underline">{r.displayName}</span>
                            <span className="block max-w-[28ch] truncate text-sm text-ink-3 lg:hidden">
                              <Status segment={r.segment} exempt={r.exempt} />
                            </span>
                            <span className="hidden max-w-[28ch] truncate text-sm text-ink-3 lg:block">{r.email ?? r.username}</span>
                          </span>
                        </Link>
                        <div className="mt-2.5 pl-[2.875rem] sm:hidden">
                          <RegisterStrip cells={withJoin(r.marks, r.joinedAt)} tz={tz} size={12} className="[--mark:13px]" label={`Watched in ${watchedWeeks} of the last 12 weeks`} />
                        </div>
                      </td>
                      <td className="hidden py-3 pr-3 lg:table-cell">
                        <Status segment={r.segment} exempt={r.exempt} />
                      </td>
                      <td className="hidden py-3 pr-3 sm:table-cell">
                        <RegisterStrip
                          cells={withJoin(r.marks, r.joinedAt)}
                          tz={tz}
                          size={12}
                          className="[--mark:12px]"
                          label={`Watched in ${watchedWeeks} of the last 12 weeks`}
                        />
                      </td>
                      <td className="hidden py-3 pr-3 text-sm md:table-cell">
                        <span className="block">{daysAgo(r.lastPlayedAt, now)}</span>
                        <span className="block max-w-[20ch] truncate text-ink-3">{r.lastTitle ?? '—'}</span>
                      </td>
                      <td className="num hidden py-3 pr-3 text-right text-sm xl:table-cell">{r.plays.toLocaleString('en')}</td>
                      <td className="num hidden py-3 pr-3 text-right text-sm xl:table-cell">{hours(r.hours)}</td>
                      <td className="hidden max-w-[18ch] truncate py-3 pr-3 text-sm text-ink-2 2xl:table-cell" title={r.libraries}>
                        {r.libraries}
                      </td>
                      <td className="num hidden py-3 pr-6 text-sm text-ink-2 2xl:table-cell">{r.since ? shortDate(r.since, tz) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
