import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from './db';
import { deliveries } from './db/schema';
import { getSetting } from './settings';

const DAY = 86_400_000;

/** Defaults sized for Resend's free tier with room left for another app on the same account. */
export const DEFAULT_LIMITS = { perDay: 70, perMonth: 2400 };

export interface QuotaState {
  perDay: number;
  perMonth: number;
  sentToday: number;
  sentMonth: number;
  /** How many more emails may go out right now. */
  remaining: number;
}

/** Playbill's own sends in rolling windows: the last 24 hours and the last 30 days. */
export function quotaState(db: Db, now = Date.now()): QuotaState {
  const limits = getSetting(db, 'email')?.limits ?? DEFAULT_LIMITS;
  const count = (since: number) =>
    db
      .select({ n: sql<number>`count(*)` })
      .from(deliveries)
      .where(and(eq(deliveries.status, 'sent'), gte(deliveries.sentAt, since)))
      .get()?.n ?? 0;
  const sentToday = count(now - DAY);
  const sentMonth = count(now - 30 * DAY);
  return {
    ...limits,
    sentToday,
    sentMonth,
    remaining: Math.max(0, Math.min(limits.perDay - sentToday, limits.perMonth - sentMonth)),
  };
}
