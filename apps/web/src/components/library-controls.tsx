'use client';

import { useMemo, useState, useTransition } from 'react';
import { type LibState, markLeaving, planRemoval, refreshLibrary } from '@/app/library/actions';

export interface Cand {
  ratingKey: string;
  title: string;
  year: number | null;
  library: string;
  addedLabel: string;
  lastLabel: string;
  bytes: number | null;
  leavingLabel: string | null;
}

const gb = (b: number) => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : `${Math.round(b / 1e9)} GB`);
const btn = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60';

function Note({ s }: { s: LibState | null }) {
  return s ? <span role="status" className={`text-sm ${s.ok ? 'text-ink-3' : 'text-red'}`}>{s.message}</span> : null;
}

export function CandidateTable({ never, stale, defaultDate }: { never: Cand[]; stale: Cand[]; defaultDate: string }) {
  const [tab, setTab] = useState<'never' | 'stale'>(never.length ? 'never' : 'stale');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(defaultDate);
  const [days, setDays] = useState(7);
  const [state, setState] = useState<LibState | null>(null);
  const [pending, start] = useTransition();
  const rows = tab === 'never' ? never : stale;
  const pickedBytes = useMemo(() => [...never, ...stale].filter((c) => picked.has(c.ratingKey)).reduce((s, c) => s + (c.bytes ?? 0), 0), [picked, never, stale]);

  const toggle = (k: string) => {
    const n = new Set(picked);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setPicked(n);
  };

  return (
    <section className="rounded-xl border border-rule bg-sheet">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
        <div role="tablist" aria-label="Which titles" className="inline-flex rounded-lg border border-rule bg-sheet p-0.5">
          {(['never', 'stale'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === t ? 'bg-action text-action-ink' : 'text-ink-2 hover:text-ink'}`}
            >
              {t === 'never' ? 'Never watched' : 'Not watched in a year'} <span className="num opacity-70">{t === 'never' ? never.length : stale.length}</span>
            </button>
          ))}
        </div>
        <button type="button" className="text-sm text-blue hover:underline" onClick={() => start(async () => setState(await refreshLibrary()))}>
          Refresh from Tautulli
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-rule px-6 py-10 text-ink-2">Nothing here. Every title has been watched recently.</p>
      ) : (
        <div className="max-h-[36rem] overflow-y-auto border-t border-rule-strong">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-rule-strong bg-sheet">
              <tr className="caps text-ink-3">
                <th scope="col" className="w-12 py-2.5 pr-3 pl-5 sm:pl-6"><span className="sr-only">Select</span></th>
                <th scope="col" className="py-2.5 pr-3 font-semibold">Title</th>
                <th scope="col" className="hidden py-2.5 pr-3 font-semibold md:table-cell">Added</th>
                <th scope="col" className="hidden py-2.5 pr-3 font-semibold md:table-cell">Last played</th>
                <th scope="col" className="py-2.5 pr-6 text-right font-semibold">Size</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.ratingKey} className="border-b border-rule last:border-b-0 hover:bg-paper/60">
                  <td className="py-2.5 pr-3 pl-5 sm:pl-6">
                    <input type="checkbox" aria-label={`Select ${c.title}`} checked={picked.has(c.ratingKey)} onChange={() => toggle(c.ratingKey)} disabled={!!c.leavingLabel} className="size-4 accent-[var(--blue)]" />
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{c.title}</span>
                    {c.year ? <span className="text-ink-3"> ({c.year})</span> : null}
                    <span className="block text-xs text-ink-3">
                      {c.library}
                      {c.leavingLabel ? ` · leaving ${c.leavingLabel}` : ''}
                    </span>
                  </td>
                  <td className="num hidden py-2.5 pr-3 text-ink-2 md:table-cell">{c.addedLabel}</td>
                  <td className="num hidden py-2.5 pr-3 text-ink-2 md:table-cell">{c.lastLabel}</td>
                  <td className="num py-2.5 pr-6 text-right text-ink-2">{c.bytes ? gb(c.bytes) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-4 border-t border-rule px-5 py-4 sm:px-6">
        <p className="text-sm">
          <span className="num font-medium">{picked.size}</span> selected{picked.size ? <> · {gb(pickedBytes)}</> : null}
        </p>
        <label className="block space-y-1 text-sm">
          <span className="text-ink-2">Remove on</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="num block rounded-lg border border-rule bg-paper/40 px-3 py-1.5" />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-ink-2">Tell people who watched</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="block rounded-lg border border-rule bg-paper/40 px-3 py-1.5">
            {[3, 7, 14].map((d) => <option key={d} value={d}>{d} days before</option>)}
          </select>
        </label>
        <button type="button" disabled={pending || picked.size === 0} className={`${btn} bg-action text-action-ink hover:bg-action-hover`} onClick={() => start(async () => {
          const r = await planRemoval([...picked], date, days);
          setState(r);
          if (r.ok) setPicked(new Set());
        })}>
          Plan removal
        </button>
        <Note s={state} />
      </div>
    </section>
  );
}

export function LeavingRow({ k }: { k: string }) {
  const [state, setState] = useState<LibState | null>(null);
  const [pending, start] = useTransition();
  if (state?.ok) return <Note s={state} />;
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={pending} className={`${btn} border border-rule bg-sheet hover:border-rule-strong`} onClick={() => start(async () => setState(await markLeaving(k, 'removed')))}>
        Removed
      </button>
      <button type="button" disabled={pending} className="text-sm text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => start(async () => setState(await markLeaving(k, 'cancelled')))}>
        Keep it
      </button>
      <Note s={state} />
    </span>
  );
}
