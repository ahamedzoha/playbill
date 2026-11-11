'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const HINTS = ['actor:', 'type:email', 'type:people', 'is:error', 'is:warning', 'action:digest.*'];

/** One search box, Sentry-style: free text plus key:value tokens. `/` focuses it from anywhere on the page. */
export function SearchBox({ value, hrefFor }: { value: string; hrefFor: string }) {
  const router = useRouter();
  const [q, setQ] = useState(value);
  const go = (next: string) => {
    const url = new URL(hrefFor, 'http://x');
    if (next.trim()) url.searchParams.set('q', next.trim());
    else url.searchParams.delete('q');
    router.push(`${url.pathname}${url.search}`, { scroll: false });
  };
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(q);
      }}
      className="min-w-0 flex-1"
    >
      <label htmlFor="activity-search" className="sr-only">
        Search activity
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-rule bg-sheet px-3 focus-within:border-blue">
        <Search size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden="true" />
        <input
          id="activity-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search events, or filter: actor:name type:email is:error"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-ink-3"
        />
        <kbd className="hidden rounded border border-rule px-1.5 text-xs text-ink-3 sm:block">/</kbd>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Filter examples">
        {HINTS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => {
              const next = h.endsWith(':') ? `${q} ${h}`.trim() : q.includes(h) ? q : `${q} ${h}`.trim();
              setQ(next);
              if (h.endsWith(':')) document.getElementById('activity-search')?.focus();
              else go(next);
            }}
            className="rounded-md border border-rule px-2 py-0.5 font-mono text-xs text-ink-2 hover:border-rule-strong hover:text-ink"
          >
            {h}
          </button>
        ))}
      </div>
    </form>
  );
}
