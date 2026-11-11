/** Shared by server pages and the client strip: a week in the register. */
export interface StripCell {
  start: number;
  end: number;
  plays: number;
  seconds: number;
  level: 0 | 1 | 2 | 3 | 4;
  topTitle: string | null;
  /** The week ended before this person joined: drawn as an empty slot, not as "didn't watch". */
  before?: boolean;
}

/** Marks weeks that ended before `joinedAt` (null = unknown, nothing marked). */
export function withJoin<T extends Omit<StripCell, 'before'>>(cells: T[], joinedAt: number | null): (T & { before?: boolean })[] {
  if (!joinedAt) return cells;
  return cells.map((c) => (c.end <= joinedAt && c.plays === 0 ? { ...c, before: true } : c));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Three-letter month in the owner's timezone, always the same width ("Sep", never "Sept"). */
export function monthShort(ts: number, tz: string): string {
  const m = Number(new Intl.DateTimeFormat('en-GB', { month: 'numeric', timeZone: tz }).format(ts));
  return MONTHS[m - 1] ?? '';
}

export function monthYear(ts: number, tz: string): string {
  const y = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: tz }).format(ts);
  return `${monthShort(ts, tz)} ${y}`;
}
