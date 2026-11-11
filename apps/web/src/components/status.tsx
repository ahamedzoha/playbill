import type { Segment } from '@playbill/core/people/segments';

const LABEL: Record<Segment, string> = {
  owner: 'Owner',
  new: 'New',
  active: 'Active',
  cooling: 'Slowing down',
  dormant: 'Gone quiet',
  inactive: 'Inactive 6+ months',
  never: 'Never watched',
  pending: 'Invite pending',
  removed: 'Removed',
};

export function segmentLabel(s: Segment): string {
  return LABEL[s];
}

/**
 * One mark vocabulary, the same square as a register mark:
 * filled = watching, half = slowing, outline = quiet, faint outline = inactive,
 * dotted = never, dashed = invite pending, struck = removed. Shape carries the state, so it
 * never depends on colour alone.
 */
export function StatusMark({ segment, size = 12 }: { segment: Segment; size?: number }) {
  const s = size;
  const r = s * 0.24;
  const common = { x: 0.75, y: 0.75, width: s - 1.5, height: s - 1.5, rx: r };
  let body;
  switch (segment) {
    case 'active':
    case 'owner':
      body = <rect {...common} fill="var(--mark-3)" stroke="var(--mark-3)" strokeWidth="1.5" />;
      break;
    case 'new':
      body = (
        <>
          <rect {...common} fill="var(--mark-1)" stroke="var(--mark-2)" strokeWidth="1.5" />
        </>
      );
      break;
    case 'cooling':
      body = (
        <>
          <rect {...common} fill="none" stroke="var(--mark-2)" strokeWidth="1.5" />
          <rect x={0.75} y={0.75} width={(s - 1.5) / 2} height={s - 1.5} rx={r} fill="var(--mark-2)" />
          <rect x={s / 2 - r} y={0.75} width={r} height={s - 1.5} fill="var(--mark-2)" />
        </>
      );
      break;
    case 'dormant':
      body = <rect {...common} fill="none" stroke="var(--mark-2)" strokeWidth="1.5" />;
      break;
    case 'inactive':
      body = <rect {...common} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" />;
      break;
    case 'never':
      body = <rect {...common} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="1 2.2" strokeLinecap="round" />;
      break;
    case 'pending':
      body = <rect {...common} fill="none" stroke="var(--mark-2)" strokeWidth="1.5" strokeDasharray="3 2" />;
      break;
    case 'removed':
      body = (
        <>
          <rect {...common} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" />
          <path d={`M${s * 0.22} ${s * 0.78} L${s * 0.78} ${s * 0.22}`} stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
      break;
  }
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" className="shrink-0">
      {body}
    </svg>
  );
}

export function Status({ segment, exempt = false }: { segment: Segment; exempt?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-ink-2">
      <StatusMark segment={segment} />
      {LABEL[segment]}
      {exempt && (
        <span className="rounded-full border border-rule-strong px-1.5 py-px text-[0.6875rem] text-ink-3" title="Never nudged, warned or removed">
          Exempt
        </span>
      )}
    </span>
  );
}
