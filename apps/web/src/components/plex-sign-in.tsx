'use client';

import { useState } from 'react';

type Status = { kind: 'idle' } | { kind: 'waiting' } | { kind: 'error'; message: string };

async function post<T>(url: string, body?: unknown): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T };
}

/**
 * Plex PIN sign-in: opens app.plex.tv in a popup and polls until the user approves.
 * The popup is opened synchronously on click so browsers don't block it.
 */
export function PlexSignIn({ label = 'Sign in with Plex' }: { label?: string }) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function start() {
    const popup = window.open('', 'plex-auth', 'width=600,height=720');
    setStatus({ kind: 'waiting' });
    const pin = await post<{ id?: number; url?: string; error?: string }>('/api/auth/plex/pin');
    if (!pin.ok || !pin.data.id || !pin.data.url) {
      popup?.close();
      setStatus({ kind: 'error', message: pin.data.error ?? 'Could not reach plex.tv.' });
      return;
    }
    if (popup) popup.location.href = pin.data.url;
    else window.location.href = pin.data.url;

    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const check = await post<{ pending?: boolean; ok?: boolean; next?: string; error?: string }>(
        '/api/auth/plex/check',
        { id: pin.data.id },
      );
      if (check.data.pending) {
        if (popup?.closed) break;
        continue;
      }
      popup?.close();
      if (check.ok && check.data.ok) {
        window.location.href = check.data.next ?? '/';
        return;
      }
      setStatus({ kind: 'error', message: check.data.error ?? 'Sign-in failed.' });
      return;
    }
    setStatus({ kind: 'error', message: 'Sign-in was cancelled or timed out. Try again.' });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={start}
        disabled={status.kind === 'waiting'}
        className="inline-flex items-center gap-2 rounded-md bg-[#e5a00d] px-4 py-2.5 font-medium text-black transition hover:brightness-95 disabled:opacity-60"
      >
        {status.kind === 'waiting' ? 'Waiting for Plex…' : label}
      </button>
      {status.kind === 'error' && (
        <p role="alert" className="text-sm text-red">
          {status.message}
        </p>
      )}
    </div>
  );
}
