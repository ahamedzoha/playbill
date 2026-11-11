import Link from 'next/link';
import { activityCounts, activityHistogram, listActivity, logBytes, RETENTION } from '@playbill/core/activity';
import { CATEGORIES, CATEGORY_LABELS, type Level, LEVEL_LABELS } from '@playbill/core/activity-classify';
import { auditLog } from '@playbill/core/db/schema';
import { sql } from 'drizzle-orm';
import { EventList, type ListEvent } from '@/components/activity/event-list';
import { LevelMark } from '@/components/activity/level-mark';
import { SearchBox } from '@/components/activity/search-box';
import { VolumeChart } from '@/components/activity/volume-chart';
import { Shell } from '@/components/shell';
import { hrefWith, RANGE_BUCKETS, RANGE_KEYS, RANGE_MS, readParams, toFilter } from '@/lib/activity-view';
import { db, requireAdmin, serverName, timezone } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activity' };

const RANGE_LABEL = { '24h': '24 hours', '7d': '7 days', '30d': '30 days', '90d': '90 days', all: 'All' } as const;

function dayKey(ts: number, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }).format(ts);
}

function dayLabel(ts: number, now: number, tz: string): string {
  const k = dayKey(ts, tz);
  if (k === dayKey(now, tz)) return 'Today';
  if (k === dayKey(now - 86_400_000, tz)) return 'Yesterday';
  const sameYear = k.slice(0, 4) === dayKey(now, tz).slice(0, 4);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: tz }).format(ts);
}

const clock = (ts: number, tz: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(ts);
const full = (ts: number, tz: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz }).format(ts);
const slot = (ts: number, tz: string, withTime: boolean) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}), timeZone: tz }).format(ts);

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const d = db();
  const tz = timezone();
  const now = Date.now();
  const p = readParams(await searchParams);
  const f = toFilter(p, now);

  const counts = activityCounts(d, f);
  const page = listActivity(d, f, { limit: 60, before: p.before });
  const oldest = d.select({ at: sql<number>`min(${auditLog.at})` }).from(auditLog).get()?.at ?? now;
  const start = p.from ?? (RANGE_MS[p.range] === null ? Math.min(oldest, now - 86_400_000) : now - RANGE_MS[p.range]!);
  const end = p.to ?? now;
  const buckets = p.from ? 48 : RANGE_BUCKETS[p.range];
  const hist = activityHistogram(d, { ...f, levels: f.levels }, start, end, buckets);
  const fine = hist.size < 86_400_000;
  const bars = hist.info.map((info, i) => {
    const a = hist.start + i * hist.size;
    const b = Math.min(end, a + hist.size);
    return { label: `${slot(a, tz, fine)} – ${slot(b, tz, fine)}`, href: hrefWith(p, { from: String(a), to: String(b) }), error: hist.error[i]!, warning: hist.warning[i]!, info };
  });

  const groups: { label: string; events: ListEvent[] }[] = [];
  for (const e of page.events) {
    const label = dayLabel(e.at, now, tz);
    if (groups.at(-1)?.label !== label) groups.push({ label, events: [] });
    groups.at(-1)!.events.push({
      id: e.id,
      level: e.level,
      time: clock(e.at, tz),
      when: full(e.at, tz),
      title: e.title,
      category: CATEGORY_LABELS[e.category],
      actor: e.actorLabel,
      targetHref: e.targetHref,
      targetLabel: e.targetLabel,
    });
  }
  const last = page.events.at(-1);
  const newest = page.events[0]?.at ?? now;
  const live = !p.before && !p.to;
  const qs = new URLSearchParams();
  if (p.q) qs.set('q', p.q);
  if (p.level) qs.set('level', p.level);
  if (p.cats.length) qs.set('cat', p.cats.join(','));
  qs.set('since', String(newest));
  const used = logBytes(d);
  const zoomed = p.from !== null;

  return (
    <Shell admin={admin} server={serverName()}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="max-w-[70ch]">
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[2.25rem]">Activity</h1>
          <p className="mt-2 text-ink-2">Everything Playbill did and every change made in it: sends, settings, people and failures.</p>
        </div>
        <p className="num text-sm text-ink-3" title="Kept for 2 years or 2 GB, whichever comes first; the oldest goes first.">
          {size(used)} of {size(RETENTION.maxBytes)} · kept 2 years
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-start">
        <SearchBox key={p.q} value={p.q} hrefFor={hrefWith(p, { q: null })} />
        <div role="group" aria-label="Time range" className="inline-flex shrink-0 self-start rounded-lg border border-rule bg-sheet p-0.5">
          {RANGE_KEYS.map((r) => {
            const active = !zoomed && r === p.range;
            return (
              <Link
                key={r}
                href={hrefWith(p, { range: r === '7d' ? null : r, from: null, to: null })}
                aria-current={active ? 'true' : undefined}
                scroll={false}
                className={`num rounded-md px-2.5 py-1.5 text-sm transition-colors ${active ? 'bg-action text-action-ink' : 'text-ink-2 hover:bg-paper hover:text-ink'}`}
              >
                {r === 'all' ? 'All' : r}
              </Link>
            );
          })}
        </div>
      </div>

      <section aria-label="Events over time" className="mt-6 rounded-xl border border-rule bg-sheet p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Level" className="flex flex-wrap gap-2">
            {([null, 'error', 'warning', 'info'] as (Level | null)[]).map((lv) => {
              const active = p.level === lv;
              const n = lv ? counts[lv] : counts.all;
              return (
                <Link
                  key={lv ?? 'all'}
                  href={hrefWith(p, { level: lv })}
                  aria-current={active ? 'true' : undefined}
                  scroll={false}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${active ? 'border-action bg-action text-action-ink' : 'border-rule bg-sheet text-ink-2 hover:border-rule-strong hover:text-ink'}`}
                >
                  {lv && <LevelMark level={lv} size={11} />}
                  {lv ? LEVEL_LABELS[lv] : 'All'}
                  <span className={`num ${active ? 'text-action-ink/75' : 'text-ink-3'}`}>{n.toLocaleString('en')}</span>
                </Link>
              );
            })}
          </div>
          {zoomed && (
            <Link href={hrefWith(p, { from: null, to: null })} scroll={false} className="text-sm text-blue hover:underline">
              Showing {slot(start, tz, true)} – {slot(end, tz, true)} · Back to {RANGE_LABEL[p.range]}
            </Link>
          )}
        </div>
        <VolumeChart bars={bars} startLabel={slot(start, tz, fine)} endLabel={zoomed ? slot(end, tz, true) : 'Now'} />
        <div role="group" aria-label="Category" className="mt-4 flex flex-wrap gap-1.5 border-t border-rule pt-4">
          {CATEGORIES.map((c) => {
            const on = p.cats.includes(c);
            const next = on ? p.cats.filter((x) => x !== c) : [...p.cats, c];
            return (
              <Link
                key={c}
                href={hrefWith(p, { cat: next.length ? next.join(',') : null })}
                aria-pressed={on}
                scroll={false}
                className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${on ? 'border-action bg-action text-action-ink' : 'border-rule text-ink-2 hover:border-rule-strong hover:text-ink'}`}
              >
                {CATEGORY_LABELS[c]}
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-label="Events" className="mt-6 overflow-clip rounded-xl border border-rule bg-sheet">
        {groups.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">Nothing matches.</p>
            <p className="mt-1 text-sm text-ink-2">
              {p.q || p.level || p.cats.length ? 'Try a wider time range, or clear the search and filters.' : 'Nothing happened in this time range.'}{' '}
              <Link href="/activity?range=all" className="text-blue hover:underline">
                Show everything
              </Link>
            </p>
          </div>
        ) : (
          <EventList groups={groups} newerUrl={`/api/activity/newer?${qs}`} live={live} />
        )}
      </section>

      <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
        <span className="text-ink-3">
          <kbd className="rounded border border-rule px-1.5 text-xs">j</kbd> <kbd className="rounded border border-rule px-1.5 text-xs">k</kbd> to move,{' '}
          <kbd className="rounded border border-rule px-1.5 text-xs">/</kbd> to search
        </span>
        <span className="flex gap-4">
          {p.before && (
            <Link href={hrefWith(p, {})} className="text-blue hover:underline">
              Newest
            </Link>
          )}
          {page.more && last && (
            <Link href={hrefWith(p, { before: `${last.at}:${last.id}` })} className="text-blue hover:underline">
              Older events
            </Link>
          )}
        </span>
      </nav>
    </Shell>
  );
}
