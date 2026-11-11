import { join } from 'node:path';
import { config, logger } from '@playbill/core';
import { pruneSessions } from '@playbill/core/auth';
import { backupDatabase, dateLabel, pruneBackups } from '@playbill/core/backup';
import { getSqlite, type Db } from '@playbill/core/db';
import type { Job, Queue } from '@playbill/core/queue';

const log = logger('jobs');

export interface JobContext {
  db: Db;
  queue: Queue;
  job: Job;
}

export type Handler = (payload: Record<string, unknown>, ctx: JobContext) => Promise<void>;

const BACKUPS_KEPT = 7;

/** Every job type the worker knows. Handlers must be safe to run twice (leases can expire). */
export const handlers: Record<string, Handler> = {
  async backup() {
    const dir = join(config().configDir, 'backups');
    const file = await backupDatabase(getSqlite(), dir, dateLabel());
    const removed = pruneBackups(dir, BACKUPS_KEPT);
    log.info('database backed up', { file, removed: removed.length });
  },

  async maintenance(_payload, { db, queue }) {
    const jobs = queue.prune(Date.now() - 14 * 24 * 3_600_000);
    const sessions = pruneSessions(db);
    log.info('maintenance done', { jobsPruned: jobs, sessionsPruned: sessions });
  },
};
