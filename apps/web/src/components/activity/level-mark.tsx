import type { Level } from '@playbill/core/activity-classify';

const NAME: Record<Level, string> = { error: 'Error', warning: 'Warning', info: 'Info' };

/**
 * The register square again, for event levels. Shape carries the level, so it never depends on
 * colour alone: filled = error, half = warning, outline = info. Red only where the owner should look.
 */
export function LevelMark({ level, size = 12, label = false }: { level: Level; size?: number; label?: boolean }) {
  const s = size;
  const r = s * 0.24;
  const box = { x: 0.75, y: 0.75, width: s - 1.5, height: s - 1.5, rx: r };
  const mark = (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden={label ? true : undefined} role={label ? undefined : 'img'} className="shrink-0">
      {!label && <title>{NAME[level]}</title>}
      {level === 'error' && <rect {...box} fill="var(--red)" stroke="var(--red)" strokeWidth="1.5" />}
      {level === 'warning' && (
        <>
          <rect {...box} fill="none" stroke="var(--red)" strokeWidth="1.5" />
          <rect x={0.75} y={0.75} width={(s - 1.5) / 2} height={s - 1.5} rx={r} fill="var(--red)" />
          <rect x={s / 2 - r} y={0.75} width={r} height={s - 1.5} fill="var(--red)" />
        </>
      )}
      {level === 'info' && <rect {...box} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" />}
    </svg>
  );
  if (!label) return mark;
  return (
    <span className="inline-flex items-center gap-1.5">
      {mark}
      <span>{NAME[level]}</span>
    </span>
  );
}
