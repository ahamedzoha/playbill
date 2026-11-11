import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { campaignSettings, digestAudience, ensureDigestCampaign, runSummary } from '@playbill/core/campaigns';
import { campaigns, people, runs } from '@playbill/core/db/schema';
import { isDryRun } from '@playbill/core/mail';
import { quotaState } from '@playbill/core/quota';
import { nextOccurrence } from '@playbill/core/schedule';
import { getSetting } from '@playbill/core/settings';
import { DigestControls, DigestForm, DigestPreview } from '@/components/digest-controls';
import { ArrivalsControls } from '@/components/arrivals-controls';
import { arrivalsSettings, ensureArrivalsCampaign, pendingArrivalsCount } from '@playbill/core/arrivals';
import { segmentOf } from '@playbill/core/people/segments';
import { preferences } from '@playbill/core/db/schema';
import { Shell } from '@/components/shell';
import { dateTime } from '@/lib/format';
import { db, requireAdmin, serverName, timezone } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Newsletters' };

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

const STATUS: Record<string, string> = {
  planned: 'Preparing',
  frozen: 'Ready to send',
  sending: 'Sending',
  done: 'Sent',
  deferred: 'Waiting',
  failed: 'Failed',
  skipped: 'Skipped',
};

function timeLabel(h: number, m: number): string {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

export default async function NewslettersPage() {
  const admin = await requireAdmin();
  const d = db();
  const tz = timezone();
  const c = ensureDigestCampaign(d);
  const s = campaignSettings(c);
  const [mm, hh, , , dow] = c.cron.split(' ');
  const day = Number(dow);
  const h = Number(hh);
  const m = Number(mm);
  const audience = digestAudience(d, 'digest');
  const quota = quotaState(d);
  const email = getSetting(d, 'email');
  const publicUrl = getSetting(d, 'general')?.publicUrl;
  const dry = isDryRun();
  const emailReady = !!email || dry;
  const next = c.enabled ? nextOccurrence(c.cron, tz, Date.now()) : null;
  const history = d.select().from(runs).orderBy(desc(runs.createdAt)).limit(15).all();
  const kindOf = new Map(d.select().from(campaigns).all().map((x) => [x.id, x.kind]));
  const previewPeople = d
    .select({ id: people.plexUserId, name: people.displayName, status: people.status })
    .from(people)
    .all()
    .filter((p) => p.status === 'owner' || p.status === 'shared' || p.status === 'home')
    .sort((a, b) => (a.status === 'owner' ? -1 : b.status === 'owner' ? 1 : a.name.localeCompare(b.name)))
    .map(({ id, name }) => ({ id, name }));

  const ac = ensureArrivalsCampaign(d);
  const as = arrivalsSettings.parse(ac.settings);
  const prefs = new Map(d.select().from(preferences).all().filter((p) => p.topic === 'arrivals').map((p) => [p.plexUserId, p.subscribed]));
  const nowTs = Date.now();
  const wanting = d
    .select()
    .from(people)
    .all()
    .filter((p) => p.email && ['shared', 'home', 'owner'].includes(p.status))
    .filter((p) => prefs.get(p.plexUserId) ?? ['active', 'new', 'owner'].includes(segmentOf(p, nowTs))).length;
  const arrivalRuns = d.select().from(runs).where(eq(runs.campaignId, ac.id)).orderBy(desc(runs.createdAt)).limit(5).all();
  const missing = [!emailReady && 'set up email', !publicUrl && !dry && 'set the public URL'].filter(Boolean) as string[];

  return (
    <Shell admin={admin} server={serverName()}>
      <header className="max-w-[70ch]">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[2.25rem]">Newsletters</h1>
        <h2 className="mt-6 text-lg font-semibold">Weekly digest</h2>
        <p className="mt-1 text-ink-2">
          {DAYS[day]} at {timeLabel(h, m)}, {c.mode === 'live' ? (
            <>
              to <span className="num text-ink">{audience.recipients.length}</span> people
            </>
          ) : (
            <>only to your test addresses</>
          )}
          {c.enabled ? (next ? <>. Next one: {dateTime(next, tz)}.</> : '.') : <>. Paused.</>}
        </p>
      </header>

      {missing.length > 0 && (
        <p className="mt-6 max-w-3xl rounded-xl border border-red/30 bg-red-wash px-5 py-4 text-sm">
          <span className="font-medium text-red">Before it can send:</span> {missing.join(' and ')} in{' '}
          <Link href="/settings" className="font-medium text-blue hover:underline">
            Settings
          </Link>
          .
        </p>
      )}
      {dry && (
        <p className="mt-6 max-w-3xl rounded-xl border border-rule bg-sheet px-5 py-4 text-sm text-ink-2">
          Email is in dry-run mode on this install: messages are written to the <code className="rounded bg-paper px-1">outbox</code> folder in your config
          directory and never sent.
        </p>
      )}

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-rule bg-sheet p-5 sm:p-6">
            <DigestControls enabled={c.enabled} mode={c.mode} audience={audience.recipients.length} emailReady={emailReady} />
            <dl className="mt-6 grid gap-x-6 gap-y-3 border-t border-rule pt-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-ink-3">Would receive it</dt>
                <dd className="num mt-0.5 text-ink">{audience.recipients.length} people</dd>
              </div>
              <div>
                <dt className="text-ink-3">Opted out or unreachable</dt>
                <dd className="num mt-0.5 text-ink">
                  {audience.optedOut} opted out · {audience.suppressed} blocked · {audience.noEmail} no email
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Sending allowance</dt>
                <dd className="num mt-0.5 text-ink">
                  {quota.sentToday} of {quota.perDay} today · {quota.sentMonth} of {quota.perMonth} this month
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-rule bg-sheet p-5 sm:p-6">
            <h2 className="mb-5 text-lg font-semibold tracking-[-0.01em]">What it says</h2>
            <DigestForm
              values={{ ...s, day, time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }}
            />
          </section>

          <section aria-labelledby="arrivals" className="rounded-xl border border-rule bg-sheet p-5 sm:p-6">
            <h2 id="arrivals" className="text-lg font-semibold tracking-[-0.01em]">
              New arrivals
            </h2>
            <p className="mt-1 mb-5 max-w-[70ch] text-sm text-ink-2">
              A short "it's here" email: new episodes go to people who watch that show, new films and series to everyone who wants them (people who watched in the last month, unless they choose otherwise). Whoever requested a title is skipped, since Seerr already told them. At most one a day per person.{' '}
              <span className="num">{pendingArrivalsCount(d)}</span> waiting{arrivalRuns[0] ? `, last batch ${dateTime(arrivalRuns[0].createdAt, tz)}` : ''}.
            </p>
            <ArrivalsControls
              v={{ enabled: ac.enabled, mode: ac.mode, debounceHours: Math.round(as.debounceMinutes / 60), maxWaitHours: as.maxWaitHours, quietStart: as.quietStart, quietEnd: as.quietEnd, testAddresses: as.testAddresses }}
              wanting={wanting}
              emailReady={emailReady}
            />
          </section>

          <section className="rounded-xl border border-rule bg-sheet">
            <h2 className="px-5 pt-5 pb-4 text-lg font-semibold tracking-[-0.01em] sm:px-6">Sent so far</h2>
            {history.length === 0 ? (
              <p className="border-t border-rule px-6 py-8 text-ink-2">Nothing sent yet. Send yourself a test to see how it looks in your inbox.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-y border-rule-strong">
                  <tr className="caps text-ink-3">
                    <th scope="col" className="py-2.5 pr-3 pl-5 font-semibold sm:pl-6">When</th>
                    <th scope="col" className="py-2.5 pr-3 font-semibold">Kind</th>
                    <th scope="col" className="py-2.5 pr-3 font-semibold">Status</th>
                    <th scope="col" className="py-2.5 pr-6 text-right font-semibold">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => {
                    const sum = runSummary(d, r.id);
                    const problems = (sum.failed ?? 0) + (sum.unknown ?? 0);
                    return (
                      <tr key={r.id} className="border-b border-rule last:border-b-0">
                        <td className="num py-2.5 pr-3 pl-5 text-ink-2 sm:pl-6">{dateTime(r.createdAt, tz)}</td>
                        <td className="py-2.5 pr-3">
                          {kindOf.get(r.campaignId) === 'arrivals' ? 'Arrivals' : 'Digest'}
                          <span className="block text-xs text-ink-3">{r.trigger === 'test' ? 'Test' : r.trigger === 'manual' ? 'Sent by hand' : 'Scheduled'}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={r.status === 'failed' || problems ? 'text-red' : ''}>
                            {r.status === 'done' && !(sum.sent ?? 0) && problems ? 'Not delivered' : STATUS[r.status]}
                          </span>
                          {r.note && <span className="block text-xs text-ink-3">{r.note}</span>}
                        </td>
                        <td className="num py-2.5 pr-6 text-right">
                          {sum.sent ?? 0}
                          {problems > 0 && <span className="block text-xs text-red">{problems} not delivered</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <section aria-labelledby="preview" className="min-w-0 rounded-xl border border-rule bg-sheet p-5">
          <h2 id="preview" className="mb-3 text-lg font-semibold tracking-[-0.01em]">
            This week's email
          </h2>
          <DigestPreview people={previewPeople} />
        </section>
      </div>
    </Shell>
  );
}
