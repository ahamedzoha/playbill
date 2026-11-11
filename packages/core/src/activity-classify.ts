/**
 * Level and category of an activity event, decided once when it's written. No imports: the audit
 * writer and the web app both use it. Migration 0006 backfills older rows with the same rules
 * (a test checks the two agree).
 */

export const LEVELS = ['error', 'warning', 'info'] as const;
export type Level = (typeof LEVELS)[number];

export const CATEGORIES = ['email', 'people', 'library', 'settings', 'system'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = { email: 'Email', people: 'People', library: 'Library', settings: 'Settings', system: 'System' };
export const LEVEL_LABELS: Record<Level, string> = { error: 'Errors', warning: 'Warnings', info: 'Info' };

const WARNINGS = new Set(['campaign.deferred', 'plex.remove', 'lifecycle.removal.approve', 'lifecycle.removal.proposed', 'lifecycle.warning.queued']);

export function categoryOf(action: string): Category {
  if (/^(digest|arrivals|recap|campaign|preferences)\./.test(action)) return 'email';
  if (/^(person|plex|lifecycle)\./.test(action)) return 'people';
  if (action.startsWith('library.')) return 'library';
  if (/^(settings|setup)\./.test(action)) return 'settings';
  return 'system';
}

export function levelOf(action: string, after: unknown): Level {
  if (action === 'job.failed') return 'error';
  if (action === 'campaign.sent') {
    const a = (after ?? {}) as { sent?: number; failed?: number };
    if ((a.failed ?? 0) > 0) return (a.sent ?? 0) === 0 ? 'error' : 'warning';
  }
  return WARNINGS.has(action) ? 'warning' : 'info';
}
