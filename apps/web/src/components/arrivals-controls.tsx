'use client';

import { useActionState, useState, useTransition } from 'react';
import { type FormState, saveArrivals, sendArrivalsTest, setArrivalsState } from '@/app/newsletters/actions';

const btn = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60';
const primary = `${btn} bg-rail text-rail-ink hover:bg-rail-active`;
const quiet = `${btn} border border-rule bg-sheet text-ink hover:border-rule-strong`;
const input = 'w-full rounded-lg border border-rule bg-paper/40 px-3 py-2 text-sm focus:border-blue focus:outline-none';

function Note({ state }: { state: FormState | null }) {
  return state ? (
    <span role="status" className={`text-sm ${state.ok ? 'text-ink-3' : 'text-red'}`}>
      {state.message}
    </span>
  ) : null;
}

export interface ArrivalsValues {
  enabled: boolean;
  mode: 'test' | 'live';
  debounceHours: number;
  maxWaitHours: number;
  quietStart: number;
  quietEnd: number;
  testAddresses: string[];
}

export function ArrivalsControls({ v, wanting, emailReady }: { v: ArrivalsValues; wanting: number; emailReady: boolean }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<FormState | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [state, action, saving] = useActionState<FormState | null, FormData>(saveArrivals, null);
  const run = (fn: () => Promise<FormState>) =>
    start(async () => {
      setNote(await fn());
      setConfirm(false);
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            role="switch"
            checked={v.enabled}
            disabled={pending}
            onChange={(e) => run(() => setArrivalsState({ enabled: e.target.checked }))}
            className="peer sr-only"
          />
          <span aria-hidden="true" className="relative h-5 w-9 rounded-full bg-rule-strong transition-colors peer-checked:bg-blue peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
          <span className="font-medium">{v.enabled ? 'On' : 'Off'}</span>
        </label>
        <button type="button" className={quiet} disabled={pending || !emailReady} onClick={() => run(sendArrivalsTest)}>
          Send a test to me
        </button>
        {v.mode === 'test' ? (
          confirm ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-sm">
              <span>
                Email the <span className="num font-medium">{wanting}</span> people who'd get these when something arrives?
              </span>
              <button type="button" className={primary} disabled={pending} onClick={() => run(() => setArrivalsState({ mode: 'live' }))}>
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
          <button type="button" className="text-sm text-ink-2 underline underline-offset-4 hover:text-ink" disabled={pending} onClick={() => run(() => setArrivalsState({ mode: 'test' }))}>
            Back to test mode
          </button>
        )}
        <Note state={note} />
      </div>

      <form action={action} className="space-y-4 border-t border-rule pt-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Wait after the last arrival</span>
            <select name="debounceHours" defaultValue={v.debounceHours} className={input}>
              {[1, 2, 3, 6].map((h) => (
                <option key={h} value={h}>
                  {h} {h === 1 ? 'hour' : 'hours'}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">But never longer than</span>
            <select name="maxWaitHours" defaultValue={v.maxWaitHours} className={input}>
              {[6, 12, 24, 48].map((h) => (
                <option key={h} value={h}>
                  {h} hours
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Quiet from</span>
            <select name="quietStart" defaultValue={v.quietStart} className={input}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Until</span>
            <select name="quietEnd" defaultValue={v.quietEnd} className={input}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Test addresses</span>
          <input name="testAddresses" defaultValue={v.testAddresses.join(', ')} className={input} />
        </label>
        <div className="flex items-center gap-3">
          <button className={primary} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <Note state={state} />
        </div>
      </form>
    </div>
  );
}
