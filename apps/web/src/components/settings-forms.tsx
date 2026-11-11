'use client';

import { useActionState, useState, useTransition } from 'react';
import { type FormState, addIntegration, removeIntegration, saveEmail, saveGeneral, saveLifecycle, sendTestEmail } from '@/app/settings/actions';

const input = 'w-full rounded-lg border border-rule bg-paper/40 px-3 py-2 text-sm focus:border-blue focus:outline-none';
const primary = 'rounded-lg bg-rail px-4 py-2 text-sm font-medium text-rail-ink transition-colors hover:bg-rail-active disabled:opacity-60';
const quiet = 'rounded-lg border border-rule bg-sheet px-4 py-2 text-sm font-medium hover:border-rule-strong disabled:opacity-60';

function Note({ state }: { state: FormState | null }) {
  return state ? (
    <span role="status" className={`text-sm ${state.ok ? 'text-ink-3' : 'text-red'}`}>
      {state.message}
    </span>
  ) : null;
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {help && <span className="block text-xs text-ink-3">{help}</span>}
    </label>
  );
}

export function GeneralForm({ publicUrl, timezone, suggestedUrl }: { publicUrl: string | null; timezone: string; suggestedUrl: string }) {
  const [state, action, pending] = useActionState<FormState | null, FormData>(saveGeneral, null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Public address" help="Where Playbill is reachable from outside. Links and images in emails use it.">
          <input name="publicUrl" defaultValue={publicUrl ?? ''} placeholder={suggestedUrl} className={input} inputMode="url" />
        </Field>
        <Field label="Timezone" help="Schedules and dates use it, e.g. Asia/Dhaka.">
          <input name="timezone" defaultValue={timezone} className={input} required />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button className={primary} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <Note state={state} />
      </div>
    </form>
  );
}

export interface EmailValues {
  provider: 'resend' | 'smtp';
  fromName: string;
  fromAddress: string;
  replyTo: string;
  host: string;
  port: string;
  secure: boolean;
  user: string;
  perDay: number;
  perMonth: number;
  hasSecret: boolean;
}

export function EmailForm({ values }: { values: EmailValues }) {
  const [state, action, pending] = useActionState<FormState | null, FormData>(saveEmail, null);
  const [provider, setProvider] = useState(values.provider);
  const [test, setTest] = useState<FormState | null>(null);
  const [testing, startTest] = useTransition();
  return (
    <form action={action} className="space-y-5">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-medium">Send with</legend>
        {(['resend', 'smtp'] as const).map((p) => (
          <label key={p} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${provider === p ? 'border-rail bg-rail text-rail-ink' : 'border-rule bg-sheet'}`}>
            <input type="radio" name="provider" value={p} checked={provider === p} onChange={() => setProvider(p)} className="sr-only" />
            {p === 'resend' ? 'Resend' : 'Any SMTP server'}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From name" help="What people see in their inbox.">
          <input name="fromName" defaultValue={values.fromName} className={input} required />
        </Field>
        <Field label="From address" help="Must be on a domain your provider has verified.">
          <input name="fromAddress" type="email" defaultValue={values.fromAddress} className={input} required />
        </Field>
        <Field label="Reply-to (optional)" help="Where replies go, e.g. your own address.">
          <input name="replyTo" type="email" defaultValue={values.replyTo} className={input} />
        </Field>
        <Field label={provider === 'resend' ? 'Resend API key' : 'SMTP password'} help={values.hasSecret ? 'Saved. Leave empty to keep it.' : undefined}>
          <input name="secret" type="password" autoComplete="off" placeholder={values.hasSecret ? '••••••••' : provider === 'resend' ? 're_…' : ''} className={`${input} font-mono`} />
        </Field>
      </div>

      {provider === 'smtp' && (
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem_1fr]">
          <Field label="SMTP server">
            <input name="host" defaultValue={values.host} className={input} placeholder="smtp.example.com" />
          </Field>
          <Field label="Port">
            <input name="port" defaultValue={values.port} className={`${input} num`} inputMode="numeric" placeholder="587" />
          </Field>
          <Field label="User name">
            <input name="user" defaultValue={values.user} className={input} autoComplete="off" />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" name="secure" defaultChecked={values.secure} className="size-4 accent-[var(--blue)]" />
            Use TLS from the start (port 465)
          </label>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Most emails per day" help="Playbill's own cap. Leave room for other apps sharing the account (Resend's free tier allows 100).">
          <input name="perDay" type="number" min={1} defaultValue={values.perDay} className={`${input} num`} />
        </Field>
        <Field label="Most emails per month" help="Resend's free tier allows 3,000.">
          <input name="perMonth" type="number" min={1} defaultValue={values.perMonth} className={`${input} num`} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className={primary} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={quiet} disabled={testing || !values.hasSecret} onClick={() => startTest(async () => setTest(await sendTestEmail()))}>
          {testing ? 'Sending…' : 'Send a test email to me'}
        </button>
        <Note state={state} />
        <Note state={test} />
      </div>
    </form>
  );
}

export function IntegrationList({ items }: { items: { id: string; kind: string; name: string; baseUrl: string; message: string | null }[] }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-rule border-y border-rule-strong">
      {items.map((it) => (
        <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
          <span className="min-w-0">
            <span className="block font-medium">{it.name}</span>
            <span className="block truncate text-sm text-ink-3">
              {it.baseUrl} · {it.message}
            </span>
          </span>
          {it.kind !== 'tautulli' &&
            (confirm === it.id ? (
              <span className="flex items-center gap-2 text-sm">
                <button type="button" className="font-medium text-red hover:underline" disabled={pending} onClick={() => start(async () => void (await removeIntegration(it.id)))}>
                  Remove {it.name}
                </button>
                <button type="button" className="text-ink-2 underline underline-offset-4" onClick={() => setConfirm(null)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="text-sm text-ink-2 hover:text-ink hover:underline" onClick={() => setConfirm(it.id)}>
                Remove…
              </button>
            ))}
        </li>
      ))}
    </ul>
  );
}

export function AddIntegrationForm() {
  const [state, action, pending] = useActionState<FormState | null, FormData>(addIntegration, null);
  const [kind, setKind] = useState('seerr');
  const placeholder = { seerr: 'http://overseerr:5055', sonarr: 'http://sonarr:8989', radarr: 'http://radarr:7878' }[kind];
  return (
    <form action={action} className="space-y-4 px-5 py-5 sm:px-6">
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr_1fr]">
        <Field label="Service">
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
            <option value="seerr">Seerr / Overseerr</option>
            <option value="sonarr">Sonarr</option>
            <option value="radarr">Radarr</option>
          </select>
        </Field>
        <Field label="Address">
          <input name="baseUrl" className={input} placeholder={placeholder} inputMode="url" required />
        </Field>
        <Field label="API key" help="Settings → General in the app.">
          <input name="apiKey" className={`${input} font-mono`} autoComplete="off" required />
        </Field>
      </div>
      <input type="hidden" name="name" value="" />
      <div className="flex items-center gap-3">
        <button className={primary} disabled={pending}>
          {pending ? 'Connecting…' : 'Test and add'}
        </button>
        <Note state={state} />
      </div>
    </form>
  );
}

export function LifecycleForm({ v }: { v: { enabled: boolean; nudgeDays: number; warnDays: number; removeDays: number; graceDays: number; sendGoodbye: boolean } }) {
  const [state, action, pending] = useActionState<FormState | null, FormData>(saveLifecycle, null);
  const num = `${input} num`;
  return (
    <form action={action} className="space-y-5">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="enabled" defaultChecked={v.enabled} className="mt-1 size-4 accent-[var(--blue)]" />
        <span className="text-sm">
          <span className="font-medium">Look after inactive people automatically</span>
          <span className="block text-ink-3">Each morning, Playbill sends nudges and warnings on its own. Removing anyone always waits for your approval. People marked exempt, Plex Home members and you are never touched.</span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Nudge after" help="days without watching">
          <input name="nudgeDays" type="number" min={14} defaultValue={v.nudgeDays} className={num} />
        </Field>
        <Field label="Warn after" help="days without watching">
          <input name="warnDays" type="number" min={30} defaultValue={v.warnDays} className={num} />
        </Field>
        <Field label="Propose removal after" help="days without watching">
          <input name="removeDays" type="number" min={60} defaultValue={v.removeDays} className={num} />
        </Field>
        <Field label="Grace after warning" help="days to play anything">
          <input name="graceDays" type="number" min={3} defaultValue={v.graceDays} className={num} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="sendGoodbye" defaultChecked={v.sendGoodbye} className="size-4 accent-[var(--blue)]" />
        Send a short goodbye when you remove someone
      </label>
      <div className="flex items-center gap-3">
        <button className={primary} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <Note state={state} />
      </div>
    </form>
  );
}
