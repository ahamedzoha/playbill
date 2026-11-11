'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Level } from '@playbill/core/activity-classify';
import { LevelMark } from './level-mark';

export interface ListEvent {
  id: string;
  level: Level;
  time: string;
  when: string;
  title: string;
  category: string;
  actor: string;
  targetHref: string | null;
  targetLabel: string | null;
}

/**
 * The event stream, newest first, grouped by day. Keyboard: j/k or arrows move, Enter opens, `/`
 * jumps to search. Checks for newer events every 20 seconds and offers them without moving the list.
 */
export function EventList({ groups, newerUrl, live }: { groups: { label: string; events: ListEvent[] }[]; newerUrl: string; live: boolean }) {
  const router = useRouter();
  const list = useRef<HTMLDivElement>(null);
  const [fresh, setFresh] = useState(0);

  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(newerUrl, { cache: 'no-store' });
        if (r.ok && !stop) setFresh(((await r.json()) as { count: number }).count);
      } catch {
        // Offline for a moment: try again next tick.
      }
    };
    const t = setInterval(tick, 20_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [newerUrl, live]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        document.getElementById('activity-search')?.focus();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const down = e.key === 'j' || e.key === 'ArrowDown';
      const up = e.key === 'k' || e.key === 'ArrowUp';
      if (!down && !up) return;
      const rows = [...(list.current?.querySelectorAll<HTMLAnchorElement>('a[data-row]') ?? [])];
      if (rows.length === 0) return;
      const i = rows.indexOf(document.activeElement as HTMLAnchorElement);
      // Arrow keys only take over once a row has focus, so they still scroll the page otherwise.
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && i === -1) return;
      e.preventDefault();
      const next = rows[i === -1 ? 0 : Math.max(0, Math.min(rows.length - 1, i + (down ? 1 : -1)))]!;
      next.focus();
      next.scrollIntoView({ block: 'nearest' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={list}>
      {fresh > 0 && (
        <button
          type="button"
          onClick={() => {
            setFresh(0);
            router.refresh();
          }}
          className="sticky top-3 z-10 mx-auto mb-3 flex items-center gap-2 rounded-full border border-rule bg-sheet px-4 py-1.5 text-sm font-medium text-blue shadow-[var(--shadow)] hover:border-rule-strong max-lg:top-16"
        >
          {fresh === 1 ? '1 new event' : `${fresh} new events`} · Show
        </button>
      )}
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="caps sticky top-0 z-[1] border-b border-rule-strong bg-sheet/95 px-5 py-2 text-ink-3 backdrop-blur-sm max-lg:top-14 sm:px-6">{g.label}</h2>
          <ol>
            {g.events.map((e) => (
              <li key={e.id} className="border-b border-rule last:border-b-0">
                <Link
                  data-row
                  href={`/activity/${e.id}`}
                  className="group grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 px-5 py-3 transition-colors outline-none hover:bg-paper/60 focus-visible:bg-blue-wash focus-visible:shadow-[inset_3px_0_0_var(--focus)] sm:grid-cols-[auto_3.5rem_minmax(0,1fr)_auto] sm:items-center sm:px-6"
                >
                  <span className="pt-1 sm:pt-0">
                    <LevelMark level={e.level} />
                  </span>
                  <time className="num hidden text-sm text-ink-3 sm:block" title={e.when}>
                    {e.time}
                  </time>
                  <span className="min-w-0">
                    <span className={`block truncate font-medium ${e.level === 'error' ? 'text-red' : 'text-ink'}`}>{e.title}</span>
                    <span className="mt-0.5 block truncate text-sm text-ink-3">
                      <span className="num sm:hidden">{e.time} · </span>
                      {e.actor}
                      {e.targetLabel && <> · {e.targetLabel}</>}
                    </span>
                  </span>
                  <span className="caps col-start-2 mt-1 justify-self-start rounded-md border border-rule px-1.5 py-0.5 text-[0.6875rem] text-ink-3 sm:col-start-auto sm:mt-0 sm:justify-self-end">{e.category}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
