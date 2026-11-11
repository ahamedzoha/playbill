'use client';

import { useActionState, useState, useTransition } from 'react';
import { type FormState, saveDigest, sendDigestNow, setDigestState } from '@/app/newsletters/actions';

const btn = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60';
const primary = `${btn} bg-rail text-rail-ink hover:bg-rail-active`;
const quiet = `${btn} border border-rule bg-sheet text-ink hover:border-rule-strong`;
const input = 'w-full rounded-lg border border-rule bg-paper/40 px-3 py-2 text-sm focus:border-blue focus:outline-none';

function Note({ state }: { state: FormState | null }) {
  if (!state) return null;
  return (
    <span role="status" className={`text-sm ${state.ok ? 'text-ink-3' : 'text-red'}`}>
      {state.message}
    </span>
  );
}

/** On/off, test/live and send buttons. Going live and sending to everyone each need a second press. */
export function DigestControls({ enabled, mode, audience, emailReady }: { enabled: boolean; mode: 'test' | 'live'; audience: number; emailReady: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState | null>(null);
  const [confirm, setConfirm] = useState<'live' | 'send' | null>(null);
  const run = (fn: () => Promise<FormState>) =>
    start(async () => {
      setState(await fn());
      setConfirm(null);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            disabled={pending}
            onChange={(e) => run(() => setDigestState({ enabled: e.target.checked }))}
            className="peer sr-only"
          />
          <span aria-hidden="true" className="relative h-5 w-9 rounded-full bg-rule-strong transition-colors peer-checked:bg-blue peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
          <span className="font-medium">{enabled ? 'On schedule' : 'Paused'}</span>
        </label>

        <button type="button" className={quiet} disabled={pending || !emailReady} onClick={() => run(() => sendDigestNow('test'))}>
          Send a test to me
        </button>

        {mode === 'test' ? (
          confirm === 'live' ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-sm">
              <span>
                Send to <span className="num font-medium">{audience}</span> people{enabled ? ' on schedule' : ' when it’s switched on'}?
              </span>
              <button type="button" className={primary} disabled={pending} onClick={() => run(() => setDigestState({ mode: 'live' }))}>
                Yes, go live
              </button>
              <button type="button" className="text-ink-2 underline underline-offset-4" onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className={primary} disabled={pending || !emailReady} onClick={() => setConfirm('live')}>
              Go live…
            </button>
          )
        ) : (
          <>
            {confirm === 'send' ? (
              <span className="inline-flex flex-wrap items-center gap-2 text-sm">
                <span>
                  Send this week's digest to <span className="num font-medium">{audience}</span> people now?
                </span>
                <button type="button" className={primary} disabled={pending} onClick={() => run(() => sendDigestNow('live'))}>
                  Send now
                </button>
                <button type="button" className="text-ink-2 underline underline-offset-4" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className={quiet} disabled={pending} onClick={() => setConfirm('send')}>
                Send now…
              </button>
            )}
            <button type="button" className="text-sm text-ink-2 underline underline-offset-4 hover:text-ink" disabled={pending} onClick={() => run(() => setDigestState({ mode: 'test' }))}>
              Back to test mode
            </button>
          </>
        )}
      </div>
      <Note state={state} />
    </div>
  );
}

export interface DigestFormValues {
  subject: string;
  intro: string;
  signature: string;
  sections: { added: boolean; coming: boolean; requests: boolean; stats: boolean };
  maxItems: number;
  testAddresses: string[];
  skipIfEmpty: boolean;
  day: number;
  time: string;
}

const SECTION_LABELS: [keyof DigestFormValues['sections'], string, string][] = [
  ['added', 'New this week', 'Films and shows added since the last digest'],
  ['requests', 'Requests that arrived', 'Titles requested in Seerr that became available (never who asked)'],
  ['coming', 'Coming up', 'Episodes and films due in the next 7 days, from Sonarr and Radarr'],
  ['stats', 'Server totals', 'Hours and plays across everyone; no names'],
];

export function DigestForm({ values }: { values: DigestFormValues }) {
  const [state, action, pending] = useActionState<FormState | null, FormData>(saveDigest, null);
  return (
    <form action={action} className="space-y-6">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Subject</span>
        <input name="subject" defaultValue={values.subject} className={input} required maxLength={150} />
        <span className="block text-xs text-ink-3">{'{server}'} becomes your server's name.</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Day</span>
          <select name="day" defaultValue={values.day} className={input}>
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Time</span>
          <input type="time" name="time" defaultValue={values.time} className={`${input} num`} required />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">A note from you (optional)</span>
        <textarea
          name="intro"
          defaultValue={values.intro}
          rows={3}
          maxLength={2000}
          placeholder="e.g. The server's moving to a new disk on Saturday, so expect a short outage."
          className={`${input} resize-y`}
        />
        <span className="block text-xs text-ink-3">Shows under the greeting in this week's email. Clear it after it's sent.</span>
      </label>

      <fieldset>
        <legend className="text-sm font-medium">Sections</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SECTION_LABELS.map(([key, label, help]) => (
            <label key={key} className="flex items-start gap-3 rounded-lg border border-rule px-3 py-2.5">
              <input type="checkbox" name={key} defaultChecked={values.sections[key]} className="mt-1 size-4 accent-[var(--blue)]" />
              <span className="text-sm">
                <span className="block font-medium">{label}</span>
                <span className="block text-ink-3">{help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Signed</span>
          <input name="signature" defaultValue={values.signature} className={input} required maxLength={120} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Most titles per section</span>
          <input type="number" name="maxItems" min={3} max={24} defaultValue={values.maxItems} className={`${input} num`} />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Test addresses</span>
        <input name="testAddresses" defaultValue={values.testAddresses.join(', ')} className={input} placeholder="you@example.com" />
        <span className="block text-xs text-ink-3">In test mode, and for "Send a test to me", only these addresses get the email.</span>
      </label>

      <label className="flex items-start gap-3">
        <input type="checkbox" name="skipIfEmpty" defaultChecked={values.skipIfEmpty} className="mt-1 size-4 accent-[var(--blue)]" />
        <span className="text-sm">
          <span className="font-medium">Skip quiet weeks</span>
          <span className="block text-ink-3">Don't send on schedule when nothing was added and nothing is coming up.</span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <Note state={state} />
      </div>
    </form>
  );
}

export function DigestPreview({ people }: { people: { id: string; name: string }[] }) {
  const [who, setWho] = useState(people[0]?.id ?? '');
  const [key, setKey] = useState(0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-2">Preview as</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-lg border border-rule bg-sheet px-2 py-1.5 text-sm">
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setKey((k) => k + 1)} className="text-sm text-blue hover:underline">
          Refresh
        </button>
        <a href={`/newsletters/preview?for=${encodeURIComponent(who)}`} target="_blank" rel="noreferrer" className="text-sm text-blue hover:underline">
          Open in a new tab
        </a>
      </div>
      <iframe
        key={`${who}:${key}`}
        title="Digest preview"
        src={`/newsletters/preview?for=${encodeURIComponent(who)}`}
        className="h-[52rem] w-full rounded-xl border border-rule bg-[#f3f5f9]"
        sandbox=""
      />
    </div>
  );
}
