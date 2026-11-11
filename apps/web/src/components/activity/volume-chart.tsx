'use client';

import Link from 'next/link';
import { useState } from 'react';

export interface VolumeBar {
  label: string;
  href: string;
  error: number;
  warning: number;
  info: number;
}

/**
 * Events over time, one bar per slot, errors and warnings stacked at the base so trouble reads first.
 * Hover shows the slot and its counts; clicking a bar narrows the list to that slot.
 */
export function VolumeChart({ bars, startLabel, endLabel }: { bars: VolumeBar[]; startLabel: string; endLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = bars.map((b) => b.error + b.warning + b.info);
  const max = Math.max(1, ...totals);
  const sum = totals.reduce((a, b) => a + b, 0);
  const errors = bars.reduce((a, b) => a + b.error, 0);
  const warnings = bars.reduce((a, b) => a + b.warning, 0);
  const h = hover !== null ? bars[hover] : null;
  const pct = (n: number) => `${(n / max) * 100}%`;

  return (
    <figure className="relative" aria-label={`${sum} events in this range: ${errors} errors, ${warnings} warnings`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className="num">{max.toLocaleString('en')} max per bar</span>
        <span className="flex items-center gap-3" aria-hidden="true">
          <Key className="bg-red" label="Errors" />
          <Key className="bg-red/45" label="Warnings" />
          <Key className="bg-mark-2" label="Everything else" />
        </span>
      </div>
      <div className="flex h-24 items-end gap-[2px] border-b border-rule-strong" onMouseLeave={() => setHover(null)}>
        {bars.map((b, i) => {
          const t = totals[i]!;
          return (
            <Link
              key={i}
              href={b.href}
              scroll={false}
              tabIndex={-1}
              aria-hidden="true"
              onMouseEnter={() => setHover(i)}
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              {/* Hit area is the whole column, bigger than the bar. */}
              <span className={`absolute inset-0 rounded-sm ${hover === i ? 'bg-paper' : ''}`} />
              {t > 0 && (
                <span className="relative flex flex-col-reverse overflow-hidden rounded-t-[3px]" style={{ height: pct(t), minHeight: 2 }}>
                  {b.error > 0 && <span className="bg-red" style={{ flexBasis: `${(b.error / t) * 100}%` }} />}
                  {b.warning > 0 && <span className="bg-red/45" style={{ flexBasis: `${(b.warning / t) * 100}%` }} />}
                  {b.info > 0 && <span className={hover === i ? 'bg-mark-4' : 'bg-mark-2'} style={{ flexBasis: `${(b.info / t) * 100}%` }} />}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-ink-3">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
      {h && hover !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 z-10 w-max max-w-56 -translate-x-1/2 rounded-lg border border-rule bg-sheet px-3 py-2 text-xs shadow-[var(--shadow)]"
          style={{ left: `clamp(7rem, ${((hover + 0.5) / bars.length) * 100}%, calc(100% - 7rem))` }}
        >
          <div className="font-medium text-ink">{h.label}</div>
          <dl className="num mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-ink-2">
            <dt>Errors</dt>
            <dd className="text-right">{h.error}</dd>
            <dt>Warnings</dt>
            <dd className="text-right">{h.warning}</dd>
            <dt>Everything else</dt>
            <dd className="text-right">{h.info}</dd>
          </dl>
          <div className="mt-1 text-ink-3">Click to show only this</div>
        </div>
      )}
    </figure>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 rounded-[2px] ${className}`} />
      {label}
    </span>
  );
}
