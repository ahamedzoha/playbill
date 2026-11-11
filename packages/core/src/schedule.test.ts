import { describe, expect, it } from 'vitest';
import { dueOccurrence, nextOccurrence } from './schedule';

const H = 3_600_000;
const at = (iso: string) => new Date(iso).getTime();

describe('dueOccurrence', () => {
  const daily3am = '0 3 * * *';

  it('runs the occurrence that just passed', () => {
    const r = dueOccurrence(daily3am, 'UTC', at('2026-11-10T03:00:00Z'), at('2026-11-11T03:00:30Z'));
    expect(r).toEqual({ occurrence: at('2026-11-11T03:00:00Z'), skipped: 0 });
  });

  it('does nothing when the last run is the latest occurrence', () => {
    const r = dueOccurrence(daily3am, 'UTC', at('2026-11-11T03:00:00Z'), at('2026-11-11T09:00:00Z'));
    expect(r.occurrence).toBeNull();
  });

  it('runs a missed occurrence within the grace period after downtime', () => {
    const r = dueOccurrence(daily3am, 'UTC', at('2026-11-10T03:00:00Z'), at('2026-11-11T08:00:00Z'), 6 * H);
    expect(r.occurrence).toBe(at('2026-11-11T03:00:00Z'));
  });

  it('skips occurrences older than the grace period', () => {
    const r = dueOccurrence(daily3am, 'UTC', at('2026-11-08T03:00:00Z'), at('2026-11-11T12:00:00Z'), 6 * H);
    expect(r).toEqual({ occurrence: null, skipped: 3 });
  });

  it('collapses several missed occurrences into the latest one', () => {
    const r = dueOccurrence('0 * * * *', 'UTC', at('2026-11-11T00:00:00Z'), at('2026-11-11T03:10:00Z'), 6 * H);
    expect(r).toEqual({ occurrence: at('2026-11-11T03:00:00Z'), skipped: 2 });
  });

  it('does not backfill on a fresh install beyond the grace period', () => {
    const r = dueOccurrence(daily3am, 'UTC', null, at('2026-11-11T12:00:00Z'), 6 * H);
    expect(r.occurrence).toBeNull();
  });

  it('honours the timezone', () => {
    // 19:00 in Dhaka (UTC+6) is 13:00 UTC.
    expect(nextOccurrence('0 19 * * *', 'Asia/Dhaka', at('2026-11-11T00:00:00Z'))).toBe(at('2026-11-11T13:00:00Z'));
  });
});
