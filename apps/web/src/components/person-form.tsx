'use client';

import { useActionState } from 'react';
import { type SaveState, savePerson } from '@/app/people/[id]/actions';

export function PersonForm({ id, note, exempt, name }: { id: string; note: string | null; exempt: boolean; name: string }) {
  const [state, action, pending] = useActionState<SaveState | null, FormData>(savePerson, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Your note</span>
        <textarea
          name="note"
          defaultValue={note ?? ''}
          rows={3}
          maxLength={1000}
          placeholder={`Who is ${name}? e.g. "Cousin in Toronto, watches anime"`}
          className="w-full resize-y rounded-lg border border-rule bg-paper/50 px-3 py-2 text-sm placeholder:text-ink-3 focus:border-blue focus:outline-none"
        />
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="exempt" defaultChecked={exempt} className="mt-1 size-4 accent-[var(--blue)]" />
        <span className="text-sm">
          <span className="font-medium">Exempt from housekeeping</span>
          <span className="block text-ink-3">Never nudged, warned or suggested for removal, however long they go without watching.</span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-rail px-4 py-2 text-sm font-medium text-rail-ink transition-colors hover:bg-rail-active disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {state && (
          <span role="status" className={`text-sm ${state.ok ? 'text-ink-3' : 'text-red'}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
