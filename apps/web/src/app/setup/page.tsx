import { redirect } from 'next/navigation';
import { hasOwner } from '@playbill/core/auth';
import { listIntegrations } from '@playbill/core/integrations';
import { getSetting } from '@playbill/core/settings';
import { isSetupComplete } from '@playbill/core/setup';
import { SetupWizard, type WizardStep } from '@/components/setup-wizard';
import { currentAdmin, db } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set up' };

export default async function SetupPage() {
  const d = db();
  if (isSetupComplete(d)) redirect('/');

  let step: WizardStep;
  if (!hasOwner(d)) {
    step = 'code';
  } else {
    const admin = await currentAdmin();
    // Someone else already claimed this install, or the owner's session expired mid-setup.
    if (admin?.role !== 'owner') redirect('/login');
    step = !getSetting(d, 'plex') ? 'server' : listIntegrations(d, 'tautulli').length === 0 ? 'tautulli' : 'done';
  }

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Set up Playbill</h1>
      <p className="mt-2 text-ink-2">Three steps: prove you run this install, sign in with Plex, and connect Tautulli.</p>
      <div className="mt-10">
        <SetupWizard step={step} />
      </div>
    </main>
  );
}
