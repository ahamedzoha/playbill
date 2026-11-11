import Link from 'next/link';

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export function parseRange(value: string | string[] | undefined): RangeDays {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 7;
}

/** A segmented control made of links, so the range lives in the URL and the back button works. */
export function RangeControl({ value, basePath }: { value: RangeDays; basePath: string }) {
  return (
    <div role="group" aria-label="Time range" className="inline-flex rounded-lg border border-rule bg-sheet p-0.5">
      {RANGES.map((r) => {
        const active = r === value;
        return (
          <Link
            key={r}
            href={r === 7 ? basePath : `${basePath}?range=${r}`}
            aria-current={active ? 'true' : undefined}
            scroll={false}
            className={`num rounded-md px-3 py-1.5 text-sm transition-colors ${
              active ? 'bg-rail text-rail-ink' : 'text-ink-2 hover:bg-paper hover:text-ink'
            }`}
          >
            {r} days
          </Link>
        );
      })}
    </div>
  );
}
