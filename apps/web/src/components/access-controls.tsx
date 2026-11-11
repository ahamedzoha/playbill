'use client';

import { useState, useTransition } from 'react';
import { approveRemoval, keepPerson, nudgePerson, reinvitePerson, type SaveState, saveLibraries, withdrawPersonInvite } from '@/app/people/[id]/actions';

const btn = 'rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60';
const quiet = `${btn} border border-rule bg-sheet hover:border-rule-strong`;
const danger = `${btn} bg-red text-white hover:brightness-95`;

function Note({ state }: { state: SaveState | null }) {
  return state ? (
    <p role="status" className={`text-sm ${state.ok ? 'text-ink-3' : 'text-red'}`}>
      {state.message}
    </p>
  ) : null;
}

function useAction() {
  const [pending, start] = useTransition();
  const [state, setState] = useState<SaveState | null>(null);
  return { pending, state, run: (fn: () => Promise<SaveState>) => start(async () => setState(await fn())) };
}

/** Library checkboxes for a person's share. Saving changes plex.tv immediately. */
export function LibraryPicker({ id, libraries, selected }: { id: string; libraries: { key: string; name: string }[]; selected: string[] }) {
  const [chosen, setChosen] = useState(new Set(selected));
  const { pending, state, run } = useAction();
  const changed = chosen.size !== selected.length || [...chosen].some((k) => !selected.includes(k));
  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Libraries</legend>
        {libraries.map((l) => (
          <label key={l.key} className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={chosen.has(l.key)}
              onChange={(e) => {
                const next = new Set(chosen);
                if (e.target.checked) next.add(l.key);
                else next.delete(l.key);
                setChosen(next);
              }}
              className="size-4 accent-[var(--blue)]"
            />
            {l.name}
          </label>
        ))}
      </fieldset>
      {changed && (
        <button type="button" className={quiet} disabled={pending || chosen.size === 0} onClick={() => run(() => saveLibraries(id, [...chosen]))}>
          {pending ? 'Saving…' : 'Save libraries'}
        </button>
      )}
      <Note state={state} />
    </div>
  );
}

/** The person page's actions. Removing access takes a second, explicit press. */
export function PersonActions({
  id,
  name,
  status,
  canNudge,
  canReinvite,
}: {
  id: string;
  name: string;
  status: string;
  canNudge: boolean;
  canReinvite: boolean;
}) {
  const { pending, state, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canNudge && (
          <>
            <button type="button" className={quiet} disabled={pending} onClick={() => run(() => nudgePerson(id))}>
              Send a nudge
            </button>
            <a href={`/newsletters?preview=nudge&for=${encodeURIComponent(id)}#preview`} className="self-center px-1 text-sm text-blue hover:underline">
              Preview it
            </a>
          </>
        )}
        {status === 'pending' && id.startsWith('invite:') && (
          <button type="button" className={quiet} disabled={pending} onClick={() => run(() => withdrawPersonInvite(id))}>
            Withdraw invite
          </button>
        )}
        {canReinvite && (
          <button type="button" className={quiet} disabled={pending} onClick={() => run(() => reinvitePerson(id))}>
            Re-invite with the same libraries
          </button>
        )}
        {status === 'shared' && !confirm && (
          <button type="button" className={`${quiet} text-red`} disabled={pending} onClick={() => setConfirm(true)}>
            Remove access…
          </button>
        )}
      </div>
      {confirm && (
        <div className="rounded-lg border border-red/40 bg-red-wash p-3.5 text-sm">
          <p className="font-medium">Remove {name}'s access to your server?</p>
          <p className="mt-1 text-ink-2">They'll lose every library at once. Playbill keeps a note of what they had, so you can re-invite them later, but they'll have to accept again.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className={danger} disabled={pending} onClick={() => run(async () => {
              const r = await approveRemoval({ plexUserId: id });
              setConfirm(false);
              return r;
            })}>
              Remove access
            </button>
            <button type="button" className={quiet} onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <Note state={state} />
    </div>
  );
}

/** One proposed removal in the approvals list. */
export function ApprovalRow({ actionId }: { actionId: string }) {
  const { pending, state, run } = useAction();
  if (state?.ok) return <Note state={state} />;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={danger} disabled={pending} onClick={() => run(() => approveRemoval({ actionId }))}>
        Remove access
      </button>
      <button type="button" className={quiet} disabled={pending} onClick={() => run(() => keepPerson(actionId, false))}>
        Keep
      </button>
      <button type="button" className="text-sm text-ink-2 underline underline-offset-4 hover:text-ink" disabled={pending} onClick={() => run(() => keepPerson(actionId, true))}>
        Keep and never ask again
      </button>
      <Note state={state} />
    </div>
  );
}
