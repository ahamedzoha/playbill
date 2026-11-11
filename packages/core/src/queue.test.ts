import { describe, expect, it } from 'vitest';
import { openTestDb } from './db/migrate';
import { Queue } from './queue';

function setup(start = 1_000_000) {
  const { db } = openTestDb();
  let now = start;
  const clock = { advance: (ms: number) => (now += ms) };
  const q = new Queue(db, () => now);
  return { db, q, clock };
}

describe('Queue', () => {
  it('claims a due job once and completes it', () => {
    const { q } = setup();
    const id = q.enqueue('sync', { a: 1 });
    const job = q.claim(['sync']);
    expect(job?.id).toBe(id);
    expect(job?.payload).toEqual({ a: 1 });
    expect(job?.attempts).toBe(1);
    expect(q.claim(['sync'])).toBeNull();
    expect(q.complete(job!)).toBe(true);
    expect(q.counts()).toEqual({ done: 1 });
  });

  it('ignores jobs of other types and jobs not yet due', () => {
    const { q, clock } = setup();
    q.enqueue('later', {}, { runAt: 1_000_000 + 60_000 });
    q.enqueue('other');
    expect(q.claim(['later'])).toBeNull();
    clock.advance(60_000);
    expect(q.claim(['later'])).not.toBeNull();
  });

  it('keeps one active job per dedupe key', () => {
    const { q } = setup();
    expect(q.enqueue('backup', {}, { dedupeKey: 'backup' })).not.toBeNull();
    expect(q.enqueue('backup', {}, { dedupeKey: 'backup' })).toBeNull();
    const job = q.claim(['backup'])!;
    expect(q.enqueue('backup', {}, { dedupeKey: 'backup' })).toBeNull();
    q.complete(job);
    expect(q.enqueue('backup', {}, { dedupeKey: 'backup' })).not.toBeNull();
  });

  it('re-claims a job whose lease expired, and the stale owner cannot finish it', () => {
    const { q, clock } = setup();
    q.enqueue('send');
    const first = q.claim(['send'], 1_000)!;
    expect(q.claim(['send'], 1_000)).toBeNull();
    clock.advance(1_001);
    const second = q.claim(['send'], 1_000)!;
    expect(second.id).toBe(first.id);
    expect(second.attempts).toBe(2);
    expect(q.complete(first)).toBe(false);
    expect(q.extend(first)).toBe(false);
    expect(q.complete(second)).toBe(true);
  });

  it('retries with backoff, then fails after max attempts', () => {
    const { q, clock } = setup();
    q.enqueue('flaky', {}, { maxAttempts: 2 });
    const a = q.claim(['flaky'])!;
    expect(q.fail(a, 'boom')).toBe(true);
    expect(q.claim(['flaky'])).toBeNull();
    clock.advance(30_000);
    const b = q.claim(['flaky'])!;
    expect(q.fail(b, 'boom again')).toBe(false);
    expect(q.counts()).toEqual({ failed: 1 });
  });

  it('prunes finished jobs older than the cutoff', () => {
    const { q, clock } = setup();
    q.enqueue('x');
    q.complete(q.claim(['x'])!);
    clock.advance(10);
    expect(q.prune(1_000_000 + 5)).toBe(1);
  });
});
