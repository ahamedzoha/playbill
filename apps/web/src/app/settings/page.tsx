import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { syncState } from '@playbill/core/db/schema';
import { listIntegrations } from '@playbill/core/integrations';
import { isDryRun } from '@playbill/core/mail';
import { DEFAULT_LIMITS } from '@playbill/core/quota';
import { getSetting } from '@playbill/core/settings';
import { AddIntegrationForm, EmailForm, GeneralForm, IntegrationList, LifecycleForm } from '@/components/settings-forms';
import { lifecycleRules } from '@playbill/core/lifecycle';
import { Shell } from '@/components/shell';
import { daysAgo } from '@/lib/format';
import { appInfo, db, requireAdmin, serverName, timezone } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-rule bg-sheet">
      <div className="px-5 pt-5 pb-4 sm:px-6">
        <h2 id={id} className="text-lg font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {intro && <p className="mt-1 max-w-[70ch] text-sm text-ink-2">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const d = db();
  const now = Date.now();
  const plex = getSetting(d, 'plex');
  const general = getSetting(d, 'general');
  const email = getSetting(d, 'email');
  const sync = d.select().from(syncState).where(eq(syncState.name, 'history')).get();
  const { version, revision } = appInfo();
  const h = await headers();
  const suggestedUrl = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost'}`;
  const integrations = listIntegrations(d).map((i) => ({ id: i.id, kind: i.kind, name: i.name, baseUrl: i.baseUrl, message: i.lastCheckMessage }));
  const syncBad = !!sync?.lastError && (!sync.lastOkAt || (sync.lastRunAt ?? 0) > sync.lastOkAt);

  return (
    <Shell admin={admin} server={serverName()}>
      <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[2.25rem]">Settings</h1>

      <div className="mt-8 max-w-4xl space-y-6">
        <Section id="general" title="Address and time">
          <div className="border-t border-rule px-5 py-5 sm:px-6">
            <GeneralForm publicUrl={general?.publicUrl ?? null} timezone={general?.timezone ?? timezone()} suggestedUrl={suggestedUrl} />
          </div>
        </Section>

        <Section
          id="email"
          title="Email"
          intro={isDryRun() ? 'Dry-run mode is on: emails are written to the outbox folder, never sent.' : 'How Playbill sends newsletters. Keys are stored encrypted.'}
        >
          <div className="border-t border-rule px-5 py-5 sm:px-6">
            <EmailForm
              values={{
                provider: email?.provider ?? 'resend',
                fromName: email?.fromName ?? serverName(),
                fromAddress: email?.fromAddress ?? '',
                replyTo: email?.replyTo ?? '',
                host: email?.smtp?.host ?? '',
                port: email?.smtp ? String(email.smtp.port) : '',
                secure: email?.smtp?.secure ?? false,
                user: email?.smtp?.user ?? '',
                perDay: email?.limits.perDay ?? DEFAULT_LIMITS.perDay,
                perMonth: email?.limits.perMonth ?? DEFAULT_LIMITS.perMonth,
                hasSecret: !!email?.secretEnc,
              }}
            />
          </div>
        </Section>

        <Section id="housekeeping" title="Housekeeping" intro="Nudge people who drift away, warn before access ends, and propose removing long-inactive shares for you to approve.">
          <div className="border-t border-rule px-5 py-5 sm:px-6">
            <LifecycleForm v={lifecycleRules(d)} />
          </div>
        </Section>

        <Section id="connections" title="Connections" intro="Seerr adds filled requests to the digest; Sonarr and Radarr add what's coming up.">
          <dl className="divide-y divide-rule border-t border-rule-strong text-sm">
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[11rem_1fr] sm:px-6">
              <dt className="text-ink-3">Plex server</dt>
              <dd>
                {plex?.name ?? 'Not set'} <span className="block truncate text-ink-3">{plex?.url}</span>
              </dd>
            </div>
            <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[11rem_1fr] sm:px-6">
              <dt className="text-ink-3">Watch history</dt>
              <dd>
                <span className={syncBad ? 'font-medium text-red' : ''}>{sync?.lastOkAt ? `Synced ${daysAgo(sync.lastOkAt, now)}` : 'Not synced yet'}</span>
                <span className="block text-ink-3">{syncBad ? `Last error: ${sync?.lastError}` : 'Every 15 minutes'}</span>
              </dd>
            </div>
          </dl>
          <IntegrationList items={integrations} />
          <AddIntegrationForm />
        </Section>

        <p className="text-sm text-ink-3">
          Playbill {version} · {revision.slice(0, 7)}
        </p>
      </div>
    </Shell>
  );
}
