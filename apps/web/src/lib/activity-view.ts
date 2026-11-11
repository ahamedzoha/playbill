import { type ActivityFilter, parseSearch } from '@playbill/core/activity';
import { CATEGORIES, type Category, LEVELS, type Level } from '@playbill/core/activity-classify';

/** The Activity page's state lives in the URL, so a view can be shared and the back button works. */
export interface ActivityParams {
  q: string;
  range: RangeKey;
  level: Level | null;
  cats: Category[];
  /** A zoomed window from clicking a bar in the chart. */
  from: number | null;
  to: number | null;
  before: { at: number; id: string } | null;
}

export const RANGE_KEYS = ['24h', '7d', '30d', '90d', 'all'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
const HOUR = 3_600_000;
export const RANGE_MS: Record<RangeKey, number | null> = { '24h': 24 * HOUR, '7d': 7 * 24 * HOUR, '30d': 30 * 24 * HOUR, '90d': 90 * 24 * HOUR, all: null };
/** Bars in the volume chart: about one per half hour on a day, one a day over 90 days. */
export const RANGE_BUCKETS: Record<RangeKey, number> = { '24h': 48, '7d': 84, '30d': 60, '90d': 90, all: 100 };

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function readParams(sp: Raw): ActivityParams {
  const range = (RANGE_KEYS as readonly string[]).includes(one(sp.range)) ? (one(sp.range) as RangeKey) : '7d';
  const level = (LEVELS as readonly string[]).includes(one(sp.level)) ? (one(sp.level) as Level) : null;
  const cats = one(sp.cat)
    .split(',')
    .filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
  const num = (v: string) => (/^\d+$/.test(v) ? Number(v) : null);
  const [bAt, bId] = one(sp.before).split(':');
  return {
    q: one(sp.q).slice(0, 300),
    range,
    level,
    cats,
    from: num(one(sp.from)),
    to: num(one(sp.to)),
    before: bAt && bId && /^\d+$/.test(bAt) ? { at: Number(bAt), id: bId } : null,
  };
}

/** The filter the core queries take: the search box's tokens plus the chips and the time window. */
export function toFilter(p: ActivityParams, now: number): ActivityFilter {
  const s = parseSearch(p.q);
  const span = RANGE_MS[p.range];
  return {
    since: p.from ?? (span === null ? null : now - span),
    until: p.to,
    levels: [...new Set([...s.levels, ...(p.level ? [p.level] : [])])],
    categories: [...new Set([...s.categories, ...p.cats])],
    actor: s.actor,
    action: s.action,
    text: s.text || undefined,
  };
}

/** A link to this view with some parameters changed (null removes one). Paging resets unless asked. */
export function hrefWith(p: ActivityParams, change: Partial<Record<'q' | 'range' | 'level' | 'cat' | 'from' | 'to' | 'before', string | null>>): string {
  const cur: Record<string, string | null> = {
    q: p.q || null,
    range: p.range === '7d' ? null : p.range,
    level: p.level,
    cat: p.cats.length ? p.cats.join(',') : null,
    from: p.from ? String(p.from) : null,
    to: p.to ? String(p.to) : null,
    before: null,
  };
  const next = { ...cur, ...change };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/activity?${s}` : '/activity';
}
