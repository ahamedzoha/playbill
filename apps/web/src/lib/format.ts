const DAY = 86_400_000;

export function daysAgo(ts: number | null, now: number): string {
  if (ts === null) return 'never';
  const d = Math.floor((now - ts) / DAY);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 730) return `${Math.round(d / 30)} months ago`;
  return `${Math.round(d / 365)} years ago`;
}

export function shortDate(ts: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).format(ts);
}

export function longDate(ts: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz }).format(ts);
}

export function dateTime(ts: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  }).format(ts);
}

export function hours(h: number): string {
  if (h === 0) return '0 h';
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h >= 100 ? Math.round(h) : Math.round(h * 10) / 10} h`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function hourLabel(h: number): string {
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : (parts[0]?.[1] ?? ''))).toUpperCase();
}
