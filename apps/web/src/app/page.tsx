import { redirect } from 'next/navigation';
import { listIntegrations } from '@playbill/core/integrations';
import { getSetting } from '@playbill/core/settings';
import { isSetupComplete } from '@playbill/core/setup';
import { SignOut } from '@/components/sign-out';
import { appInfo, currentAdmin, db } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Placeholder home until the Insights dashboard lands (P1). */
export default async function Home() {
  const d = db();
  if (!isSetupComplete(d)) redirect('/setup');
  const admin = await currentAdmin();
  if (!admin) redirect('/login');

  const plex = getSetting(d, 'plex');
  const tautulli = listIntegrations(d, 'tautulli')[0];
  const { version, revision } = appInfo();

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-16">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Playbill</h1>
        <div className="flex items-center gap-4 text-sm text-muted">
          <span>{admin.username}</span>
          <SignOut />
        </div>
      </header>
      <section className="space-y-3 rounded-lg border border-line bg-surface p-6">
        <h2 className="font-semibold">Connected</h2>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Plex server</dt>
          <dd>
            {plex?.name} <span className="text-muted">({plex?.url})</span>
          </dd>
          <dt className="text-muted">Tautulli</dt>
          <dd>
            {tautulli?.baseUrl} <span className="text-muted">({tautulli?.lastCheckMessage})</span>
          </dd>
        </dl>
      </section>
      <p className="text-sm text-muted">
        Insights, newsletters and user management are on the way. Playbill {version} · {revision.slice(0, 7)}
      </p>
    </main>
  );
}
