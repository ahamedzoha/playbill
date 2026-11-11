import { Cron } from 'croner';
import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { schedules } from './db/schema';

/** How late a missed occurrence may still run after a restart. Older ones are skipped. */
export const DEFAULT_GRACE_MS = 6 * 3_600_000;

export interface DueResult {
  /** The occurrence to run now, if any (epoch ms of its scheduled time). */
  occurrence: number | null;
  /** Occurrences skipped because they were older than the grace period. */
  skipped: number;
}

/**
 * Works out whether a cron schedule has an occurrence due, given when it last ran.
 * Croner only computes times; the tick loop owns state, so restarts can't double-run or lose a run.
 */
export function dueOccurrence(
  pattern: string,
  timezone: string,
  lastOccurrence: number | null,
  now: number,
  graceMs = DEFAULT_GRACE_MS,
): DueResult {
  const cron = new Cron(pattern, { timezone, paused: true });
  // Never ran: start counting from one grace period ago so a fresh install doesn't backfill history.
  let cursor = new Date(lastOccurrence ?? now - graceMs);
  let latest: number | null = null;
  let skipped = 0;
  for (let i = 0; i < 1000; i++) {
    const next = cron.nextRun(cursor);
    if (!next || next.getTime() > now) break;
    if (latest !== null) skipped++;
    latest = next.getTime();
    cursor = next;
  }
  // A schedule that never ran has nothing to "miss": only report skips after real downtime.
  const report = (n: number) => (lastOccurrence === null ? 0 : n);
  if (latest === null) return { occurrence: null, skipped: 0 };
  if (now - latest > graceMs) return { occurrence: null, skipped: report(skipped + 1) };
  return { occurrence: latest, skipped: report(skipped) };
}

export function nextOccurrence(pattern: string, timezone: string, after: number): number | null {
  return new Cron(pattern, { timezone, paused: true }).nextRun(new Date(after))?.getTime() ?? null;
}

export function lastOccurrenceOf(db: Db, name: string): number | null {
  return db.select().from(schedules).where(eq(schedules.name, name)).get()?.lastOccurrence ?? null;
}

export function markOccurrence(db: Db, name: string, occurrence: number, now = Date.now()): void {
  db.insert(schedules)
    .values({ name, lastOccurrence: occurrence, lastRunAt: now })
    .onConflictDoUpdate({ target: schedules.name, set: { lastOccurrence: occurrence, lastRunAt: now } })
    .run();
}
