'use client';

import { useState } from 'react';

const SEQ = ['var(--mark-0)', 'var(--mark-1)', 'var(--mark-2)', 'var(--mark-3)', 'var(--mark-4)'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_LONG = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

function hourShort(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function hourRange(h: number): string {
  const f = (x: number) => (x === 0 ? 'midnight' : x === 12 ? 'noon' : x < 12 ? `${x} am` : `${x - 12} pm`);
  return `${f(h)}–${f((h + 1) % 24)}`;
}

/**
 * When people watch: weekday × hour, one sequential blue on the register's own scale
 * (five steps, quantiles of the non-zero cells, so a single busy evening can't flatten the rest).
 */
export function PeakGrid({ grid, days }: { grid: number[][]; days: number }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const values = grid.flat().filter((n) => n > 0).sort((a, b) => a - b);
  const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (n: number) => (n === 0 ? 0 : n <= cuts[0]! ? 1 : n <= cuts[1]! ? 2 : n <= cuts[2]! ? 3 : 4);
  const cur = hover ? grid[hover.d]![hover.h]! : null;

  return (
    <figure className="space-y-3">
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <div className="grid grid-cols-[2.25rem_1fr] gap-x-2">
          <div />
          <div className="mb-1 grid grid-cols-24 text-[0.6875rem] text-ink-3">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="num text-center">
                {h % 6 === 0 ? hourShort(h) : ''}
              </span>
            ))}
          </div>
          {grid.map((row, d) => (
            <div key={d} className="contents">
              <span className="caps self-center text-[0.6875rem] text-ink-3">{DAYS[d]}</span>
              <div className="grid grid-cols-24 gap-[2px] py-[1px]">
                {row.map((n, h) => (
                  <span
                    key={h}
                    className="block aspect-square min-h-2 rounded-[3px]"
                    style={{
                      background: SEQ[level(n)],
                      outline: hover?.d === d && hover.h === h ? '2px solid var(--ink)' : undefined,
                      outlineOffset: 1,
                    }}
                    onMouseEnter={() => setHover({ d, h })}
                    onClick={() => setHover({ d, h })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {hover && cur !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-30 w-max -translate-x-1/2 -translate-y-full rounded-lg border border-rule bg-sheet px-3 py-2 text-sm shadow-sheet"
            style={{ left: `calc(2.75rem + (100% - 2.75rem) * ${(hover.h + 0.5) / 24})`, top: `calc(1.25rem + ${hover.d} * (100% - 1.25rem) / 7)` }}
          >
            <p className="caps text-ink-3">
              {DAYS_LONG[hover.d]}, {hourRange(hover.h)}
            </p>
            <p className="num mt-1 font-medium">
              {cur} {cur === 1 ? 'play' : 'plays'} in {days} days
            </p>
          </div>
        )}
      </div>
      <figcaption className="flex items-center gap-2 text-xs text-ink-3">
        Fewer
        {SEQ.map((c, i) => (
          <span key={i} className="block size-2.5 rounded-[3px]" style={{ background: c }} />
        ))}
        More plays
      </figcaption>
    </figure>
  );
}

export interface WeekBar {
  start: number;
  end: number;
  plays: number;
  hours: number;
  people: number;
}

/** Hours watched per week: one series, thin bars on a recessive baseline, hover for the week. */
export function WeeklyBars({ weeks, tz }: { weeks: WeekBar[]; tz: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.hours));
  const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
  const cur = hover === null ? null : weeks[hover];
  const nice = Math.ceil(max / 10) * 10;

  return (
    <figure className="space-y-2">
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <div className="flex h-40 items-end gap-1.5 border-b border-rule-strong">
          {weeks.map((w, i) => (
            <button
              key={w.start}
              type="button"
              className="group flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${fmt.format(w.start)}: ${w.hours} hours, ${w.plays} plays, ${w.people} people`}
            >
              <span
                className={`block w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-mark-4' : 'bg-mark-2'}`}
                style={{ height: `${Math.max(w.hours > 0 ? 2 : 0, (w.hours / nice) * 100)}%` }}
              />
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[0.6875rem] text-ink-3">
          <span className="num">{weeks[0] ? fmt.format(weeks[0].start) : ''}</span>
          <span>This week</span>
        </div>
        <span className="num absolute top-0 left-0 -translate-y-full pb-1 text-[0.6875rem] text-ink-3">{nice} h</span>
        {cur && (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full z-30 mb-2 w-max -translate-x-1/2 rounded-lg border border-rule bg-sheet px-3 py-2 text-sm shadow-sheet"
            style={{ left: `${((hover! + 0.5) / weeks.length) * 100}%` }}
          >
            <p className="caps text-ink-3">
              {fmt.format(cur.start)} – {fmt.format(cur.end - 1)}
            </p>
            <p className="num mt-1 font-medium">{cur.hours} hours</p>
            <p className="num text-ink-2">
              {cur.plays} plays · {cur.people} {cur.people === 1 ? 'person' : 'people'}
            </p>
          </div>
        )}
      </div>
    </figure>
  );
}

/** People watching each week: the headline number's recent history, as small marks on one scale. */
export function ActiveHistory({ weeks, total, tz }: { weeks: { start: number; end: number; count: number }[]; total: number; tz: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
  const cur = hover === null ? null : weeks[hover];
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div className="flex h-10 items-end gap-[3px]" role="img" aria-label={`People watching each week, last ${weeks.length} weeks: ${weeks.map((w) => w.count).join(', ')} of ${total}`}>
        {weeks.map((w, i) => (
          <span
            key={w.start}
            className={`block w-2.5 rounded-[3px] ${i === weeks.length - 1 ? 'bg-mark-4' : hover === i ? 'bg-mark-3' : 'bg-mark-2'}`}
            style={{ height: `${w.count === 0 ? 6 : Math.max(14, (w.count / max) * 100)}%` }}
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </div>
      {cur && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full z-30 mb-2 w-max -translate-x-1/2 rounded-lg border border-rule bg-sheet px-3 py-1.5 text-sm shadow-sheet"
          style={{ left: hover! * 13 + 5 }}
        >
          <span className="num font-medium">{cur.count}</span> watched · {fmt.format(cur.start)} – {fmt.format(cur.end - 1)}
        </div>
      )}
    </div>
  );
}
