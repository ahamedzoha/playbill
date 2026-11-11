import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activityEvent } from '@playbill/core/activity';
import { CATEGORY_LABELS } from '@playbill/core/activity-classify';
import { LevelMark } from '@/components/activity/level-mark';
import { Shell } from '@/components/shell';
import { daysAgo } from '@/lib/format';
import { db, requireAdmin, serverName, timezone } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activity event' };

const KIND = { digest: 'Weekly digest', arrivals: 'New arrivals', recap: 'Monthly recap', leaving: 'Leaving soon', lifecycle: 'Account notice' } as Record<string, string>;
const TRIGGER = { schedule: 'On schedule', manual: 'Sent by hand', test: 'Test' } as Record<string, string>;
const DELIVERY = { sent: 'Sent', failed: 'Failed', unknown: 'Unknown', pending: 'Waiting', sending: 'Sending', skipped: 'Skipped' } as Record<string, string>;
const PROVIDER = { 'email.delivered': 'Delivered', 'email.bounced': 'Bounced', 'email.complained': 'Marked as spam', 'email.delivery_delayed': 'Delayed', 'email.opened': 'Opened', 'email.clicked': 'Clicked' } as Record<string, string>;

const full = (ts: number, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz, timeZoneName: 'short' }).format(ts);
const clock = (ts: number, tz: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(ts);

function show(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return 'none';
  if (typeof v === 'string') return v || '(empty)';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return v > 1_000_000_000_000 && v < 4_000_000_000_000 ? new Date(v).toISOString().replace('T', ' ').slice(0, 16) : v.toLocaleString('en');
  return JSON.stringify(v);
}

function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-rule bg-sheet">
      <div className="flex items-baseline justify-between gap-4 px-5 pt-5 pb-3 sm:px-6">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default async function ActivityEventPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const tz = timezone();
  const d = activityEvent(db(), id);
  if (!d) notFound();
  const e = d.event;
  const now = Date.now();
  const tags: [string, React.ReactNode][] = [
    ['Level', <LevelMark key="l" level={e.level} label />],
    ['Category', CATEGORY_LABELS[e.category]],
    ['By', e.actorLabel],
    ['Action', <code key="a" className="font-mono text-[0.8125rem]">{e.action}</code>],
    ...(e.targetLabel ? [['About', e.targetHref ? <Link key="t" href={e.targetHref} className="text-blue hover:underline">{e.targetLabel}</Link> : e.targetLabel] as [string, React.ReactNode]] : []),
    ['Event', <code key="i" className="font-mono text-[0.8125rem] break-all">{e.id}</code>],
  ];
  const raw = JSON.stringify({ id: e.id, at: e.at, actor: e.actor, action: e.action, target: e.target, before: d.before, after: d.after }, null, 2);

  return (
    <Shell admin={admin} server={serverName()}>
      <nav aria-label="Breadcrumb" className="text-sm text-ink-3">
        <Link href="/activity" className="text-blue hover:underline">
          Activity
        </Link>{' '}
        / {CATEGORY_LABELS[e.category]}
      </nav>

      <header className="mt-3 max-w-[80ch]">
        <div className="flex items-start gap-3">
          <span className="pt-2.5">
            <LevelMark level={e.level} size={14} />
          </span>
          <h1 className={`text-[1.5rem] leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-[1.875rem] ${e.level === 'error' ? 'text-red' : ''}`}>{e.title}</h1>
        </div>
        <p className="num mt-2 pl-[26px] text-ink-2">
          <time dateTime={new Date(e.at).toISOString()}>{full(e.at, tz)}</time> · {daysAgo(e.at, now)}
        </p>
      </header>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {d.before === null && d.after !== null && !d.run && d.changes.length > 0 && (
            <Panel title="Recorded">
              <dl className="border-t border-rule">
                {d.changes.map((c) => (
                  <div key={c.path} className="grid grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)] gap-3 border-b border-rule px-5 py-2.5 text-sm last:border-b-0 sm:px-6">
                    <dt className="font-mono text-[0.8125rem] text-ink-2">{c.path}</dt>
                    <dd className="min-w-0 break-words">{show(c.after)}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )}

          {d.before !== null && d.changes.length > 0 && (
            <Panel title="What changed">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-y border-rule-strong">
                    <tr className="caps text-ink-3">
                      <th scope="col" className="py-2.5 pr-3 pl-5 font-semibold sm:pl-6">Field</th>
                      <th scope="col" className="py-2.5 pr-3 font-semibold">Before</th>
                      <th scope="col" className="py-2.5 pr-6 font-semibold">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.changes.map((c) => (
                      <tr key={c.path} className="border-b border-rule align-top last:border-b-0">
                        <th scope="row" className="py-2.5 pr-3 pl-5 font-mono text-[0.8125rem] font-normal text-ink-2 sm:pl-6">{c.path}</th>
                        <td className="max-w-[24ch] py-2.5 pr-3 break-words text-ink-3 line-through decoration-ink-3/40">{c.before === undefined ? <span className="no-underline">—</span> : show(c.before)}</td>
                        <td className="max-w-[32ch] py-2.5 pr-6 break-words text-ink">{show(c.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {d.run && (
            <Panel
              title={`${KIND[d.run.kind] ?? d.run.kind} · ${TRIGGER[d.run.trigger] ?? d.run.trigger}`}
              aside={<span className="num text-sm text-ink-3">{clock(d.run.createdAt, tz)}</span>}
            >
              <dl className="grid grid-cols-2 gap-px border-y border-rule bg-rule sm:grid-cols-4">
                {(['sent', 'failed', 'unknown', 'pending'] as const).map((k) => (
                  <div key={k} className="bg-sheet px-5 py-3 sm:px-6">
                    <dt className="caps text-ink-3">{DELIVERY[k]}</dt>
                    <dd className={`num mt-1 text-xl font-semibold ${k !== 'sent' && (d.run!.counts[k] ?? 0) > 0 ? 'text-red' : ''}`}>{(d.run!.counts[k] ?? 0).toLocaleString('en')}</dd>
                  </div>
                ))}
              </dl>
              {d.run.note && <p className="px-5 pt-3 text-sm text-ink-2 sm:px-6">{d.run.note}</p>}
              {d.run.deliveries.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-rule-strong">
                      <tr className="caps text-ink-3">
                        <th scope="col" className="py-2.5 pr-3 pl-5 font-semibold sm:pl-6">Recipient</th>
                        <th scope="col" className="py-2.5 pr-3 font-semibold">Status</th>
                        <th scope="col" className="py-2.5 pr-6 font-semibold">What the provider saw</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.run.deliveries.map((x) => (
                        <tr key={x.id} className="border-b border-rule align-top last:border-b-0">
                          <td className="py-2.5 pr-3 pl-5 sm:pl-6">
                            {x.plexUserId ? (
                              <Link href={`/people/${encodeURIComponent(x.plexUserId)}`} className="font-medium hover:underline">
                                {x.name}
                              </Link>
                            ) : (
                              <span className="font-medium">{x.name === 'there' ? 'Test address' : x.name}</span>
                            )}
                            <span className="block text-xs text-ink-3">{x.email}</span>
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className={x.status === 'failed' || x.status === 'unknown' ? 'text-red' : ''}>{DELIVERY[x.status] ?? x.status}</span>
                            {x.sentAt && <span className="num block text-xs text-ink-3">{clock(x.sentAt, tz)}</span>}
                            {x.error && <span className="block max-w-[40ch] text-xs text-red">{x.error}</span>}
                          </td>
                          <td className="py-2.5 pr-6 text-ink-2">
                            {x.events.length ? x.events.map((v) => PROVIDER[v.type] ?? v.type).join(' → ') : <span className="text-ink-3">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          <Panel title="Raw">
            <details className="group border-t border-rule">
              <summary className="cursor-pointer px-5 py-3 text-sm text-blue hover:underline sm:px-6">Show the stored record</summary>
              <pre className="overflow-x-auto border-t border-rule bg-paper/50 px-5 py-4 font-mono text-[0.8125rem] leading-relaxed text-ink-2 sm:px-6">{raw}</pre>
            </details>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-xl border border-rule bg-sheet">
            <h2 className="px-5 pt-5 pb-3 text-lg font-semibold tracking-[-0.01em]">Details</h2>
            <dl className="border-t border-rule">
              {tags.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 border-b border-rule px-5 py-2.5 text-sm last:border-b-0">
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="min-w-0 text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-rule bg-sheet">
            <h2 className="px-5 pt-5 pb-1 text-lg font-semibold tracking-[-0.01em]">Around this time</h2>
            <p className="px-5 pb-3 text-sm text-ink-3">What happened just before and after, the same day.</p>
            <ol className="relative border-t border-rule py-2">
              {d.nearby.map((n) => {
                const self = n.id === e.id;
                return (
                  <li key={n.id} className="relative">
                    <span aria-hidden="true" className="absolute top-0 bottom-0 left-[25px] w-px bg-rule" />
                    <Link
                      href={`/activity/${n.id}`}
                      aria-current={self ? 'page' : undefined}
                      className={`relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-5 py-2 text-sm ${self ? 'bg-blue-wash' : 'hover:bg-paper/60'}`}
                    >
                      <span className="relative z-[1] mt-1 rounded-sm bg-sheet">
                        <LevelMark level={n.level} size={11} />
                      </span>
                      <span className="min-w-0">
                        <span className={`block truncate ${self ? 'font-semibold text-ink' : 'text-ink-2'}`}>{n.title}</span>
                        <span className="num block text-xs text-ink-3">
                          {clock(n.at, tz)} · {n.actorLabel}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
