import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { personDetail, weeklyMarks } from '@playbill/core/insights';
import { Avatar } from '@/components/avatar';
import { PersonForm } from '@/components/person-form';
import { RegisterKey, RegisterStrip } from '@/components/register-strip';
import { monthYear, withJoin } from '@/lib/register';
import { Shell } from '@/components/shell';
import { Status } from '@/components/status';
import { dateTime, daysAgo, hours, longDate, plural } from '@/lib/format';
import { db, requireAdmin, serverName, timezone } from '@/lib/server';

export const dynamic = 'force-dynamic';

const DECISION: Record<string, string> = {
  'direct play': 'Direct play',
  copy: 'Direct stream',
  transcode: 'Transcode',
};

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const d = db();
  const tz = timezone();
  const now = Date.now();
  const detail = personDetail(d, id, now);
  if (!detail) notFound();
  const { person: p } = detail;
  const joined = detail.acceptedAt ?? detail.invitedAt;
  const year = withJoin(weeklyMarks(d, [id], now, 52).get(id) ?? [], joined);
  const quarters = [0, 13, 26, 39].map((i) => year.slice(i, i + 13));
  const weeksWatched = year.filter((c) => c.level > 0).length;
  const weeksMember = year.filter((c) => !c.before).length;
  const yearHours = Math.round(year.reduce((s, c) => s + c.seconds, 0) / 360) / 10;

  return (
    <Shell admin={admin} server={serverName()}>
      <Link href="/people" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} aria-hidden="true" /> People
      </Link>

      <header className="mt-5 flex flex-wrap items-center gap-5">
        <Avatar name={p.displayName} thumb={p.thumb} size={64} muted={p.segment === 'removed'} />
        <div className="min-w-0">
          <h1 className="truncate text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[2.25rem]">{p.displayName}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
            <Status segment={p.segment} exempt={p.exempt} />
            <span>{p.username !== p.displayName ? `@${p.username}` : null}</span>
            {p.email && <span className="truncate">{p.email}</span>}
          </div>
        </div>
      </header>

      <p className="mt-6 max-w-[70ch] text-lg text-ink-2">
        {joined ? <>With you since {longDate(joined, tz)}. </> : null}
        {p.lastPlayedAt ? (
          <>
            Last watched <span className="text-ink">{p.lastTitle}</span> {daysAgo(p.lastPlayedAt, now)}.{' '}
          </>
        ) : (
          <>Hasn't watched anything yet. </>
        )}
        Watched in <span className="num text-ink">{weeksWatched}</span> of the{' '}
        {weeksMember < 52 && joined ? <>{weeksMember} weeks since {longDate(joined, tz)}</> : 'last 52 weeks'}, {hours(yearHours)} in all.
      </p>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="year" className="rounded-xl border border-rule bg-sheet p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="year" className="text-lg font-semibold tracking-[-0.01em]">
                The last 52 weeks
              </h2>
              <RegisterKey showBefore={year.some((c) => c.before)} />
            </div>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 2xl:grid-cols-4">
              {quarters.map((q, i) => (
                <div key={i}>
                  <p className="caps mb-2 text-ink-3">
                    {q[0] ? monthYear(q[0].start, tz) : ''}
                  </p>
                  <RegisterStrip fluid cells={q} tz={tz} size={16} className="[--mark:16px]" label={`Watched in ${q.filter((c) => c.level > 0).length} of these 13 weeks`} />
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="recent" className="rounded-xl border border-rule bg-sheet">
            <h2 id="recent" className="px-5 pt-5 pb-4 text-lg font-semibold tracking-[-0.01em] sm:px-6">
              Recent plays
            </h2>
            {detail.recent.length === 0 ? (
              <p className="border-t border-rule px-6 py-8 text-ink-2">No plays recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-y border-rule-strong">
                    <tr className="caps text-ink-3">
                      <th scope="col" className="py-2.5 pr-3 pl-5 font-semibold sm:pl-6">
                        Title
                      </th>
                      <th scope="col" className="hidden py-2.5 pr-3 font-semibold sm:table-cell">
                        When
                      </th>
                      <th scope="col" className="hidden py-2.5 pr-3 font-semibold md:table-cell">
                        Device
                      </th>
                      <th scope="col" className="hidden py-2.5 pr-3 font-semibold lg:table-cell">
                        Playback
                      </th>
                      <th scope="col" className="py-2.5 pr-6 text-right font-semibold">
                        Watched
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recent.map((h) => (
                      <tr key={h.id} className="border-b border-rule last:border-b-0">
                        <td className="py-2.5 pr-3 pl-5 sm:pl-6">
                          <span className="block max-w-[36ch] truncate font-medium">{h.grandparentTitle ?? h.title}</span>
                          {h.grandparentTitle && (
                            <span className="block max-w-[36ch] truncate text-ink-3">
                              {h.seasonNumber !== null && h.episodeNumber !== null ? `S${h.seasonNumber} E${h.episodeNumber} · ` : ''}
                              {h.title}
                            </span>
                          )}
                        </td>
                        <td className="num hidden py-2.5 pr-3 text-ink-2 sm:table-cell">{dateTime(h.startedAt, tz)}</td>
                        <td className="hidden max-w-[18ch] truncate py-2.5 pr-3 text-ink-2 md:table-cell">{h.player ?? h.platform ?? '—'}</td>
                        <td className="hidden py-2.5 pr-3 text-ink-2 lg:table-cell">{DECISION[h.transcodeDecision ?? ''] ?? '—'}</td>
                        <td className="num py-2.5 pr-6 text-right text-ink-2">
                          {hours(Math.round((h.playSeconds / 3600) * 10) / 10)}
                          {h.percentComplete !== null && <span className="hidden text-ink-3 sm:inline"> · {h.percentComplete}%</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="notes" className="rounded-xl border border-rule bg-sheet p-5">
            <h2 id="notes" className="mb-4 text-lg font-semibold tracking-[-0.01em]">
              Notes
            </h2>
            <PersonForm id={p.id} note={p.note} exempt={p.exempt} name={p.displayName} />
          </section>

          <section aria-labelledby="facts" className="rounded-xl border border-rule bg-sheet p-5">
            <h2 id="facts" className="mb-3 text-lg font-semibold tracking-[-0.01em]">
              Access
            </h2>
            <dl className="divide-y divide-rule text-sm">
              <Fact label="Libraries" value={p.libraries} />
              <Fact label="Invited" value={detail.invitedAt ? longDate(detail.invitedAt, tz) : '—'} />
              <Fact label="Accepted" value={detail.acceptedAt ? longDate(detail.acceptedAt, tz) : p.segment === 'pending' ? 'Not yet' : '—'} />
              <Fact label="Seen by Plex" value={detail.plexLastSeenAt ? daysAgo(detail.plexLastSeenAt, now) : '—'} />
              <Fact label="All time" value={`${plural(p.plays, 'play', 'plays')} · ${hours(p.hours)}`} />
            </dl>
          </section>

          {detail.topTitles.length > 0 && (
            <section aria-labelledby="top" className="rounded-xl border border-rule bg-sheet p-5">
              <h2 id="top" className="mb-3 text-lg font-semibold tracking-[-0.01em]">
                Most watched
              </h2>
              <ol className="divide-y divide-rule text-sm">
                {detail.topTitles.map((t) => (
                  <li key={t.title} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{t.title}</span>
                    <span className="num shrink-0 text-ink-3">{hours(t.hours)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {detail.devices.length > 0 && (
            <section aria-labelledby="devices" className="rounded-xl border border-rule bg-sheet p-5">
              <h2 id="devices" className="mb-3 text-lg font-semibold tracking-[-0.01em]">
                Devices
              </h2>
              <ul className="divide-y divide-rule text-sm">
                {detail.devices.map((dv) => (
                  <li key={`${dv.player}|${dv.platform}`} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate">{dv.player}</span>
                      <span className="block text-ink-3">{dv.platform}</span>
                    </span>
                    <span className="shrink-0 text-ink-3">{daysAgo(dv.lastAt, now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </Shell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 truncate text-right" title={value}>
        {value}
      </dd>
    </div>
  );
}
