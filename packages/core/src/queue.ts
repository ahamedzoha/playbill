import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from './db';
import { jobs } from './db/schema';
import { newId } from './ids';

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string;
}

export interface EnqueueOptions {
  runAt?: number;
  dedupeKey?: string;
  maxAttempts?: number;
}

export const DEFAULT_LEASE_MS = 10 * 60_000;

/**
 * A durable job queue on SQLite, safe with more than one process.
 *
 * Claiming is a single `UPDATE … RETURNING` statement, so two processes can never take the same job.
 * A claim is a lease: if the process dies, the job becomes claimable again once the lease runs out.
 * Handlers must therefore be idempotent (they may run more than once).
 */
export class Queue {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns the new job id, or null when a job with the same dedupe key is already queued or running. */
  enqueue(type: string, payload: Record<string, unknown> = {}, opts: EnqueueOptions = {}): string | null {
    const now = this.now();
    const id = newId('job');
    const res = this.db
      .insert(jobs)
      .values({
        id,
        type,
        payload,
        status: 'queued',
        dedupeKey: opts.dedupeKey ?? null,
        runAt: opts.runAt ?? now,
        maxAttempts: opts.maxAttempts ?? 3,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
    return res.changes > 0 ? id : null;
  }

  claim(types: string[], leaseMs = DEFAULT_LEASE_MS): Job | null {
    if (types.length === 0) return null;
    const now = this.now();
    const owner = newId('lease');
    const placeholders = sql.join(
      types.map((t) => sql`${t}`),
      sql`, `,
    );
    const row = this.db.get<{
      id: string;
      type: string;
      payload: string;
      attempts: number;
      max_attempts: number;
    }>(sql`
      update jobs
         set status = 'running',
             attempts = attempts + 1,
             lease_until = ${now + leaseMs},
             lease_owner = ${owner},
             updated_at = ${now}
       where id = (
         select id from jobs
          where type in (${placeholders})
            and ((status = 'queued' and run_at <= ${now})
              or (status = 'running' and lease_until < ${now}))
          order by run_at
          limit 1)
      returning id, type, payload, attempts, max_attempts`);
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      leaseOwner: owner,
    };
  }

  /** Keeps a long-running job's lease alive. Returns false if the lease was lost. */
  extend(job: Job, leaseMs = DEFAULT_LEASE_MS): boolean {
    const now = this.now();
    return (
      this.db
        .update(jobs)
        .set({ leaseUntil: now + leaseMs, updatedAt: now })
        .where(and(eq(jobs.id, job.id), eq(jobs.leaseOwner, job.leaseOwner), eq(jobs.status, 'running')))
        .run().changes > 0
    );
  }

  complete(job: Job): boolean {
    return (
      this.db
        .update(jobs)
        .set({ status: 'done', leaseUntil: null, updatedAt: this.now() })
        .where(and(eq(jobs.id, job.id), eq(jobs.leaseOwner, job.leaseOwner)))
        .run().changes > 0
    );
  }

  /** Re-queues with exponential backoff, or marks failed after the last attempt. Returns true if it will retry. */
  fail(job: Job, error: string): boolean {
    const now = this.now();
    const retry = job.attempts < job.maxAttempts;
    this.db
      .update(jobs)
      .set({
        status: retry ? 'queued' : 'failed',
        runAt: retry ? now + Math.min(3_600_000, 30_000 * 2 ** (job.attempts - 1)) : undefined,
        leaseUntil: null,
        lastError: error.slice(0, 2000),
        updatedAt: now,
      })
      .where(and(eq(jobs.id, job.id), eq(jobs.leaseOwner, job.leaseOwner)))
      .run();
    return retry;
  }

  hasActive(dedupeKey: string): boolean {
    return !!this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.dedupeKey, dedupeKey), inArray(jobs.status, ['queued', 'running'])))
      .get();
  }

  prune(olderThan: number): number {
    return this.db
      .delete(jobs)
      .where(and(inArray(jobs.status, ['done', 'failed']), lt(jobs.updatedAt, olderThan)))
      .run().changes;
  }

  counts(): Record<string, number> {
    const rows = this.db
      .select({ status: jobs.status, n: sql<number>`count(*)` })
      .from(jobs)
      .groupBy(jobs.status)
      .all();
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }
}
