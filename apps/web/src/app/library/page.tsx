import { leavingList, removalCandidates } from '@playbill/core/library';
import { CandidateTable, LeavingRow } from '@/components/library-controls';
import { Shell } from '@/components/shell';
import { daysAgo, longDate, shortDate } from '@/lib/format';
import { db, requireAdmin, serverName, timezone } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Library' };

const tb = (b: number) => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : `${Math.round(b / 1e9)} GB`);

export default async function LibraryPage() {
  const admin = await requireAdmin();
  const d = db();
  const tz = timezone();
  const now = Date.now();
  const c = removalCandidates(d, now);
  const planned = leavingList(d);
  const toRow = (x: (typeof c.never)[number]) => ({
    ratingKey: x.ratingKey,
    title: x.title,
    year: x.year,
    library: x.library,
    addedLabel: x.addedAt ? shortDate(x.addedAt, tz) + ` ${new Date(x.addedAt).getFullYear()}` : '—',
    lastLabel: x.lastPlayedAt ? daysAgo(x.lastPlayedAt, now) : 'never',
    bytes: x.bytes,
    leavingLabel: x.leavingAt ? shortDate(x.leavingAt, tz) : null,
  });
  const defaultDate = new Date(now + 14 * 86_400_000).toISOString().slice(0, 10);

  return (
    <Shell admin={admin} server={serverName()}>
      <header className="max-w-[70ch]">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[2.25rem]">Library</h1>
        <p className="mt-3 text-lg text-ink-2">
          {c.never.length + c.stale.length === 0 ? (
            'Everything on the server has been watched in the last year.'
          ) : (
            <>
              <span className="num text-ink">{c.never.length}</span> titles were never watched ({tb(c.neverBytes)}), and <span className="num text-ink">{c.stale.length}</span> haven't been watched in a year ({tb(c.staleBytes)}).
            </>
          )}
        </p>
        <p className="mt-2 text-sm text-ink-3">Plan a removal and Playbill tells the people who watched it beforehand, then reminds you on the day. It never deletes files; you do that in Radarr, Sonarr or Plex.</p>
      </header>

      {planned.length > 0 && (
        <section aria-labelledby="leaving" className="mt-8 rounded-xl border border-rule bg-sheet">
          <h2 id="leaving" className="px-5 pt-5 pb-4 text-lg font-semibold tracking-[-0.01em] sm:px-6">
            Leaving soon
          </h2>
          <ul className="divide-y divide-rule border-t border-rule-strong">
            {planned.map((p) => (
              <li key={p.ratingKey} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
                <span>
                  <span className={`font-medium ${p.removeAt <= now ? 'text-red' : ''}`}>{p.title}</span>
                  <span className="block text-sm text-ink-3">
                    {p.removeAt <= now ? 'Due today: delete it, then mark it removed' : `Leaving ${longDate(p.removeAt, tz)}`} · {p.status === 'notified' ? 'viewers told' : `viewers told ${p.noticeDays} days before`}
                  </span>
                </span>
                <LeavingRow k={p.ratingKey} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8">
        <CandidateTable never={c.never.map(toRow)} stale={c.stale.map(toRow)} defaultDate={defaultDate} />
      </div>
    </Shell>
  );
}
