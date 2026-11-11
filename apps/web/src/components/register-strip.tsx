'use client';

import { type KeyboardEvent, useRef, useState } from 'react';
import { monthShort, type StripCell } from '@/lib/register';

export type { StripCell } from '@/lib/register';

const FILL = ['var(--mark-0)', 'var(--mark-1)', 'var(--mark-2)', 'var(--mark-3)', 'var(--mark-4)'];
const SIZE = 'var(--mark,var(--mark-fallback))';

function fmtHours(seconds: number): string {
  const h = seconds / 3600;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  return `${Math.round(h * 10) / 10} h`;
}

/**
 * The register: one mark per week on one shared scale, the same everywhere it appears.
 * Fill steps with that week's hours (< 1 h, 1–3 h, 3–8 h, 8 h+); a week without watching is a faint
 * slot; a week before they joined is an open hairline slot.
 * Mouse: hover a mark. Touch: tap it. Keyboard: the strip is one tab stop; arrow keys step through
 * the weeks and the week's numbers are announced.
 * Size comes from the --mark CSS variable so a parent can shrink marks on small screens.
 */
export function RegisterStrip({
  cells,
  tz,
  size = 14,
  label,
  animateKey,
  className = '',
  fluid = false,
}: {
  cells: StripCell[];
  tz: string;
  size?: number;
  /** Accessible summary, e.g. "Watched in 9 of the last 12 weeks". */
  label: string;
  /** Changing this replays the ink-in animation (used when the range changes). */
  animateKey?: string;
  className?: string;
  /** Fill the parent's width: marks shrink to fit (never above their size), so the strip can't overflow. */
  fluid?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const marks = useRef<(HTMLSpanElement | null)[]>([]);
  const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
  const fmtDay = (t: number) => fmt.format(t).replace('Sept', 'Sep');
  const cell = active === null ? null : cells[active];
  const el = active === null ? null : marks.current[active];
  const left = el ? el.offsetLeft + el.offsetWidth / 2 : 0;

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const last = cells.length - 1;
    const cur = active ?? last;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
    else if (e.key === 'ArrowRight') next = Math.min(last, cur + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Escape') setActive(null);
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  }

  return (
    <div
      className={`relative rounded-[4px] ${fluid ? 'block w-full' : 'inline-block'} ${className}`}
      style={{ ['--mark-fallback' as string]: `${size}px` }}
      tabIndex={0}
      role="group"
      aria-label={`${label}. Use the arrow keys to read each week.`}
      onKeyDown={onKey}
      onFocus={() => setActive((a) => a ?? cells.length - 1)}
      onBlur={() => setActive(null)}
      onMouseLeave={() => setActive(null)}
    >
      <div className="flex" style={{ gap: `calc(${SIZE} * 0.22)` }} key={animateKey} aria-hidden="true">
        {cells.map((c, i) => (
          <span
            key={c.start}
            ref={(node) => {
              marks.current[i] = node;
            }}
            className="mark-ink block"
            style={{
              ...(fluid ? { flex: '1 1 0', minWidth: 0, maxWidth: SIZE, aspectRatio: '1' } : { width: SIZE, height: SIZE }),
              borderRadius: `calc(${SIZE} * 0.24)`,
              background: c.before ? 'transparent' : FILL[c.level],
              boxShadow: c.before ? 'inset 0 0 0 1px var(--slot-line)' : undefined,
              outline: active === i ? '2px solid var(--ink)' : undefined,
              outlineOffset: 1,
              ['--i' as string]: i,
            }}
            onMouseEnter={() => setActive(i)}
            onClick={() => setActive(active === i ? null : i)}
          />
        ))}
      </div>
      <div
        role="tooltip"
        aria-live="polite"
        className={`pointer-events-none absolute bottom-full z-30 mb-2 w-max max-w-64 -translate-x-1/2 rounded-lg border border-rule bg-sheet px-3 py-2 text-sm shadow-sheet ${
          cell ? '' : 'sr-only'
        }`}
        style={{ left }}
      >
        {cell && (
          <>
            <p className="caps text-ink-3">
              {fmtDay(cell.start)} – {fmtDay(cell.end - 1)}
            </p>
            {cell.before ? (
              <p className="mt-1 text-ink-2">Before they joined</p>
            ) : cell.plays === 0 ? (
              <p className="mt-1 text-ink-2">Didn't watch</p>
            ) : (
              <>
                <p className="num mt-1 font-medium text-ink">
                  {cell.plays} {cell.plays === 1 ? 'play' : 'plays'} · {fmtHours(cell.seconds)}
                </p>
                {cell.topTitle && <p className="truncate text-ink-2">Mostly {cell.topTitle}</p>}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The register's printed column head: month ticks over the weeks where a month begins, and a
 * "Now" tick over the current week, so the marks read as ruled columns.
 */
export function RegisterHeader({ weeks, tz, className = '', size = 12 }: { weeks: { start: number }[]; tz: string; className?: string; size?: number }) {
  const monthOf = (t: number) => monthShort(t, tz);
  return (
    <div
      aria-hidden="true"
      className={`relative flex h-4 items-end ${className}`}
      style={{ ['--mark-fallback' as string]: `${size}px`, gap: `calc(${SIZE} * 0.22)` }}
    >
      {weeks.map((w, i) => {
        const starts = i > 0 && monthOf(w.start) !== monthOf(weeks[i - 1]!.start);
        const now = i === weeks.length - 1;
        return (
          <span key={w.start} className="relative block h-full" style={{ width: SIZE }}>
            {starts && !now && i < weeks.length - 2 && (
              <span className="caps absolute bottom-1 left-0 text-[0.625rem] whitespace-nowrap text-ink-3">{monthOf(w.start)}</span>
            )}
            {starts && !now && i < weeks.length - 2 && <span className="absolute bottom-0 left-0 h-1 w-px bg-rule-strong" />}
            {now && (
              <>
                <span className="caps absolute right-0 bottom-1 text-[0.625rem] whitespace-nowrap text-ink-2">Now</span>
                <span className="absolute bottom-0 left-1/2 h-1 w-0.5 -translate-x-1/2 rounded-full bg-ink-2" />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** The key under every register: what the mark fills mean. */
export function RegisterKey({ showBefore = false }: { showBefore?: boolean }) {
  const steps = ['Under 1 h', '1–3 h', '3–8 h', '8 h+'];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
      {showBefore && (
        <span className="inline-flex items-center gap-1.5">
          <span className="block size-2.5 rounded-[3px]" style={{ boxShadow: 'inset 0 0 0 1px var(--slot-line)' }} />
          Not yet joined
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span className="block size-2.5 rounded-[3px]" style={{ background: FILL[0] }} />
        Didn't watch
      </span>
      {steps.map((s, i) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="block size-2.5 rounded-[3px]" style={{ background: FILL[i + 1] }} />
          {s}
        </span>
      ))}
    </div>
  );
}
