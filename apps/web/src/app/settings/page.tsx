import { eq } from 'drizzle-orm';
import { syncState } from '@playbill/core/db/schema';
import { listIntegrations } from '@playbill/core/integrations';
import { getSetting } from '@playbill/core/settings';
import { Shell } from '@/components/shell';
import { daysAgo } from '@/lib/format';
import { appInfo, db, requireAdmin, serverName, timezone } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const d = db();
  const now = Date.now();
  const plex = getSetting(d, 'plex');
  const tautulli = listIntegrations(d, 'tautulli')[0];
  const sync = d.select().from(syncState).where(eq(syncState.name, 'history')).get();
  const { version, revision } = appInfo();

  return (
    <Shell admin={admin} server={serverName()}>
      <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[2.25rem]">Settings</h1>
      <p className="mt-2 max-w-[70ch] text-ink-2">Connections Playbill reads from. Email, branding and more arrive with newsletters.</p>

      <section className="mt-8 max-w-3xl rounded-xl border border-rule bg-sheet">
        <h2 className="px-5 pt-5 pb-4 text-lg font-semibold tracking-[-0.01em] sm:px-6">Connections</h2>
        <dl className="divide-y divide-rule border-t border-rule-strong text-sm">
          <Row label="Plex server" value={plex ? `${plex.name}` : 'Not set'} detail={plex?.url} />
          <Row label="Tautulli" value={tautulli?.lastCheckMessage ?? 'Not connected'} detail={tautulli?.baseUrl} />
          <Row
            label="Watch history"
            value={sync?.lastOkAt ? `Synced ${daysAgo(sync.lastOkAt, now)}` : 'Not synced yet'}
            detail={sync?.lastError ? `Last error: ${sync.lastError}` : 'Every 15 minutes'}
            bad={!!sync?.lastError && (!sync.lastOkAt || (sync.lastRunAt ?? 0) > sync.lastOkAt)}
          />
          <Row label="Timezone" value={timezone()} detail="From the TZ setting of the container" />
          <Row label="Version" value={version} detail={revision.slice(0, 7)} />
        </dl>
      </section>
    </Shell>
  );
}

function Row({ label, value, detail, bad = false }: { label: string; value: string; detail?: string; bad?: boolean }) {
  return (
    <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[11rem_1fr] sm:px-6">
      <dt className="text-ink-3">{label}</dt>
      <dd>
        <span className={bad ? 'font-medium text-red' : ''}>{value}</span>
        {detail && <span className="block truncate text-ink-3">{detail}</span>}
      </dd>
    </div>
  );
}
