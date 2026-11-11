'use client';

import { useActionState } from 'react';
import { type PrefState, savePreferences } from '@/app/u/[token]/actions';

export function PreferencesForm({
  token,
  topics,
  current,
  highlight,
}: {
  token: string;
  topics: { id: string; label: string; description: string }[];
  current: Record<string, boolean>;
  highlight: string | null;
}) {
  const [state, action, pending] = useActionState<PrefState | null, FormData>(savePreferences, null);
  const focus = topics.find((t) => t.id === highlight);

  if (state?.ok) {
    return (
      <p role="status" className="rounded-xl border border-rule bg-sheet px-5 py-6 text-lg">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="token" value={token} />
      {focus && (
        <div className="rounded-xl border border-rule bg-sheet p-5">
          <p className="font-medium">Stop the {focus.label.toLowerCase()}?</p>
          <p className="mt-1 text-sm text-ink-2">You'll still get anything else you've chosen below.</p>
          <input type="hidden" name={`unsub:${focus.id}`} value="1" />
          <button
            type="submit"
            name="action"
            value="save"
            onClick={(e) => {
              const box = e.currentTarget.form?.elements.namedItem(`topic:${focus.id}`) as HTMLInputElement | null;
              if (box) box.checked = false;
            }}
            className="mt-4 rounded-lg bg-action px-4 py-2.5 text-sm font-medium text-action-ink hover:bg-action-hover disabled:opacity-60"
            disabled={pending}
          >
            Yes, stop the {focus.label.toLowerCase()}
          </button>
        </div>
      )}

      <fieldset className="rounded-xl border border-rule bg-sheet">
        <legend className="sr-only">Emails you get</legend>
        <ul className="divide-y divide-rule">
          {topics.map((t) => (
            <li key={t.id}>
              <label className="flex cursor-pointer items-start gap-3 px-5 py-4">
                <input type="checkbox" name={`topic:${t.id}`} defaultChecked={current[t.id]} className="mt-1 size-4 accent-[var(--blue)]" />
                <span>
                  <span className="block font-medium">{t.label}</span>
                  <span className="block text-sm text-ink-2">{t.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="submit"
          name="action"
          value="save"
          disabled={pending}
          className="rounded-lg bg-action px-4 py-2.5 text-sm font-medium text-action-ink hover:bg-action-hover disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save my choices'}
        </button>
        <button type="submit" name="action" value="none" disabled={pending} className="text-sm text-ink-2 underline underline-offset-4 hover:text-ink">
          No emails at all
        </button>
      </div>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red">
          {state.message}
        </p>
      )}
    </form>
  );
}
