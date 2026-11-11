'use client';

import { useState } from 'react';
import { PREVIEW_LABELS, type PreviewKind } from '@playbill/core/preview-kinds';

const GROUPS: { label: string; kinds: PreviewKind[] }[] = [
  { label: 'Newsletters', kinds: ['digest', 'arrivals', 'recap'] },
  { label: 'Library', kinds: ['leaving'] },
  { label: 'Account notices', kinds: ['nudge', 'warning', 'goodbye'] },
];

const select = 'rounded-lg border border-rule bg-sheet px-2 py-1.5 text-sm';

/**
 * Every email Playbill sends, as one person would get it. Built live from current data; the strip
 * at the top of the frame shows the subject, and says when the content is a sample.
 */
export function EmailPreview({ people, initialKind, initialPerson }: { people: { id: string; name: string }[]; initialKind: PreviewKind; initialPerson?: string }) {
  const [kind, setKind] = useState<PreviewKind>(initialKind);
  const [who, setWho] = useState(initialPerson && people.some((p) => p.id === initialPerson) ? initialPerson : (people[0]?.id ?? ''));
  const [key, setKey] = useState(0);
  const src = `/newsletters/preview?email=${kind}&for=${encodeURIComponent(who)}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-2">Email</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as PreviewKind)} className={select}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.kinds.map((k) => (
                  <option key={k} value={k}>
                    {PREVIEW_LABELS[k]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-2">As</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className={select}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <span className="flex items-center gap-3">
          <button type="button" onClick={() => setKey((k) => k + 1)} className="text-sm text-blue hover:underline">
            Refresh
          </button>
          <a href={src} target="_blank" rel="noreferrer" className="text-sm text-blue hover:underline">
            Open in a new tab
          </a>
        </span>
      </div>
      <iframe key={`${src}:${key}`} title={`${PREVIEW_LABELS[kind]} preview`} src={src} className="h-[52rem] w-full rounded-xl xl:h-[calc(100vh-10rem)] border border-rule bg-[#0c0c0e]" sandbox="" />
    </div>
  );
}
