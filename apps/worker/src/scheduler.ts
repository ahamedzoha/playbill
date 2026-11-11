import { errorMessage, logger } from '@playbill/core';
import type { Db } from '@playbill/core/db';
import type { Queue } from '@playbill/core/queue';
import { dueOccurrence, lastOccurrenceOf, markOccurrence } from '@playbill/core/schedule';
import { getSetting } from '@playbill/core/settings';

const log = logger('scheduler');

interface BuiltIn {
  name: string;
  cron: string;
  job: string;
}

/** Housekeeping that every install runs. Campaign schedules join this loop in a later phase. */
const BUILT_IN: BuiltIn[] = [
  { name: 'backup', cron: '30 3 * * *', job: 'backup' },
  { name: 'maintenance', cron: '15 4 * * *', job: 'maintenance' },
];

export const TICK_MS = 30_000;

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly queue: Queue,
  ) {}

  timezone(): string {
    return getSetting(this.db, 'general')?.timezone ?? process.env.TZ ?? 'UTC';
  }

  /** Enqueues every schedule that has an occurrence due. Safe to call at any time. */
  tick(now = Date.now()): void {
    const tz = this.timezone();
    for (const s of BUILT_IN) {
      try {
        const due = dueOccurrence(s.cron, tz, lastOccurrenceOf(this.db, s.name), now);
        if (due.skipped > 0) log.warn(`skipped ${due.skipped} missed run(s) of ${s.name}`);
        if (due.occurrence === null) continue;
        this.db.transaction(() => {
          this.queue.enqueue(s.job, { occurrence: due.occurrence }, { dedupeKey: `schedule:${s.name}` });
          markOccurrence(this.db, s.name, due.occurrence!, now);
        });
      } catch (err) {
        log.error(`schedule ${s.name} failed`, { error: errorMessage(err) });
      }
    }
  }

  start(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
