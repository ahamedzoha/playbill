'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { PlexSignIn } from './plex-sign-in';

export type WizardStep = 'code' | 'server' | 'tautulli' | 'done';

interface Server {
  machineId: string;
  name: string;
  connections: { uri: string; local: boolean; relay: boolean }[];
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const input =
  'w-full rounded-md border border-rule bg-sheet px-3 py-2 outline-none focus:border-blue focus:outline-none';
const primary =
  'rounded-md bg-action px-4 py-2.5 font-medium text-action-ink transition-colors hover:bg-action-hover disabled:opacity-60';

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-rule bg-sheet p-6">
      <h2 className="font-semibold">
        <span className="mr-2 text-ink-2">{n}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ErrorText({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-red">
      {message}
    </p>
  ) : null;
}

function CodeStep({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await post('/api/setup/code', { code });
    setBusy(false);
    if (res.ok) onDone();
    else setError(String(res.data.error ?? 'That code did not work.'));
  }

  return (
    <Section n={1} title="Enter the setup code">
      <p className="text-sm text-ink-2">
        Playbill printed a one-time code when it started. Find it with{' '}
        <code className="rounded bg-paper px-1">docker logs playbill</code> or in{' '}
        <code className="rounded bg-paper px-1">setup-code.txt</code> in your config folder.
      </p>
      <form onSubmit={submit} className="flex gap-3">
        <input
          className={`${input} font-mono uppercase tracking-widest`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD-EFGH"
          autoComplete="off"
          aria-label="Setup code"
          required
        />
        <button className={primary} disabled={busy}>
          Continue
        </button>
      </form>
      <ErrorText message={error} />
    </Section>
  );
}

function ServerStep() {
  const [servers, setServers] = useState<Server[] | null>(null);
  const [choice, setChoice] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/setup/servers')
      .then(async (r) => {
        const data = (await r.json()) as { servers?: Server[]; error?: string };
        if (!r.ok) throw new Error(data.error ?? 'Could not load your servers.');
        setServers(data.servers ?? []);
        if (data.servers?.length === 1) setChoice(data.servers[0]!.machineId);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await post('/api/setup/server', { machineId: choice, manualUrl });
    setBusy(false);
    if (res.ok) window.location.reload();
    else setError(String(res.data.error ?? 'Could not connect.'));
  }

  return (
    <Section n={2} title="Choose your Plex server">
      {servers === null && !error && <p className="text-sm text-ink-2">Asking plex.tv for your servers…</p>}
      {servers?.length === 0 && <p className="text-sm text-red">This Plex account doesn't own a server.</p>}
      {servers && servers.length > 0 && (
        <form onSubmit={submit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="sr-only">Server</legend>
            {servers.map((s) => (
              <label key={s.machineId} className="flex items-center gap-3 rounded-md border border-rule p-3">
                <input
                  type="radio"
                  name="server"
                  value={s.machineId}
                  checked={choice === s.machineId}
                  onChange={() => setChoice(s.machineId)}
                />
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-ink-2">{s.connections.length} known addresses</span>
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1 text-sm">
            <span className="text-ink-2">Address Playbill should use (optional)</span>
            <input
              className={input}
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="http://192.168.1.10:32400"
              inputMode="url"
            />
            <span className="block text-xs text-ink-2">
              Leave empty to try every address plex.tv knows, local ones first.
            </span>
          </label>
          <button className={primary} disabled={busy || !choice}>
            {busy ? 'Testing connections…' : 'Use this server'}
          </button>
        </form>
      )}
      <ErrorText message={error} />
    </Section>
  );
}

function TautulliStep() {
  const [url, setUrl] = useState('http://tautulli:8181');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await post('/api/setup/tautulli', { url, apiKey });
    setBusy(false);
    if (res.ok) window.location.href = '/';
    else setError(String(res.data.error ?? 'Tautulli did not answer.'));
  }

  return (
    <Section n={3} title="Connect Tautulli">
      <p className="text-sm text-ink-2">
        Playbill reads watch history and users from Tautulli. Find the API key in Tautulli under Settings → Web
        Interface → API.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span className="text-ink-2">Tautulli address</span>
          <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" required />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-ink-2">API key</span>
          <input
            className={`${input} font-mono`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <button className={primary} disabled={busy}>
          {busy ? 'Testing…' : 'Connect and finish'}
        </button>
      </form>
      <ErrorText message={error} />
    </Section>
  );
}

export function SetupWizard({ step }: { step: WizardStep }) {
  const [codeOk, setCodeOk] = useState(false);

  if (step === 'code' && !codeOk) return <CodeStep onDone={() => setCodeOk(true)} />;
  if (step === 'code')
    return (
      <Section n={2} title="Sign in with Plex">
        <p className="text-sm text-ink-2">Use the Plex account that owns your server. It becomes Playbill's owner.</p>
        <PlexSignIn />
      </Section>
    );
  if (step === 'server') return <ServerStep />;
  if (step === 'tautulli') return <TautulliStep />;
  return <p>All set. Taking you to Playbill…</p>;
}
