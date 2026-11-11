import { redirect } from 'next/navigation';
import { hasOwner } from '@playbill/core/auth';
import { PlexSignIn } from '@/components/plex-sign-in';
import { currentAdmin, db } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  if (!hasOwner(db())) redirect('/setup');
  if (await currentAdmin()) redirect('/');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Playbill</h1>
        <p className="text-muted">Sign in with the Plex account that runs this server, or one the owner has allowed.</p>
      </div>
      <PlexSignIn />
    </main>
  );
}
