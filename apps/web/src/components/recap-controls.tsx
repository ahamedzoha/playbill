'use client';

import { useState, useTransition } from 'react';
import { type FormState, sendRecapTest, setRecapState } from '@/app/newsletters/actions';

const btn = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60';
const primary = `${btn} bg-rail text-rail-ink hover:bg-rail-active`;
const quiet = `${btn} border border-rule bg-sheet text-ink hover:border-rule-strong`;

export function RecapControls({ enabled, mode, emailReady }: { enabled: boolean; mode: 'test' | 'live'; emailReady: boolean }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<FormState | null>(null);
  const [confirm, setConfirm] = useState(false);
  const run = (fn: () => Promise<FormState>) =>
    start(async () => {
      setNote(await fn());
      setConfirm(false);
    });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm">
        <input type="checkbox" role="switch" checked={enabled} disabled={pending} onChange={(e) => run(() => setRecapState({ enabled: e.target.checked }))} className="peer sr-only" />
        <span aria-hidden="true" className="relative h-5 w-9 rounded-full bg-rule-strong transition-colors peer-checked:bg-blue peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
        <span className="font-medium">{enabled ? 'On' : 'Off'}</span>
      </label>
      <button type="button" className={quiet} disabled={pending || !emailReady} onClick={() => run(sendRecapTest)}>
        Send a test to me
      </button>
      {mode === 'test' ? (
        confirm ? (
          <span className="inline-flex flex-wrap items-center gap-2 text-sm">
            <span>Send each person their own recap on the 1st?</span>
            <button type="button" className={primary} disabled={pending} onClick={() => run(() => setRecapState({ mode: 'live' }))}>
              Yes, go live
            </button>
            <button type="button" className="text-ink-2 underline underline-offset-4" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className={primary} disabled={pending || !emailReady} onClick={() => setConfirm(true)}>
            Go live…
          </button>
        )
      ) : (
        <button type="button" className="text-sm text-ink-2 underline underline-offset-4 hover:text-ink" disabled={pending} onClick={() => run(() => setRecapState({ mode: 'test' }))}>
          Back to test mode
        </button>
      )}
      {note && (
        <span role="status" className={`text-sm ${note.ok ? 'text-ink-3' : 'text-red'}`}>
          {note.message}
        </span>
      )}
    </div>
  );
}
