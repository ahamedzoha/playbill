import { errorMessage, logger } from '@playbill/core';
import type { Db } from '@playbill/core/db';
import type { Queue } from '@playbill/core/queue';
import { dueOccurrence, lastOccurrenceOf, markOccurrence } from '@playbill/core/schedule';
import { createRun } from '@playbill/core/campaigns';
import { campaigns } from '@playbill/core/db/schema';
import { getSetting } from '@playbill/core/settings';
import { eq } from 'drizzle-orm';
import { isSetupComplete } from '@playbill/core/setup';

const log = logger('scheduler');

interface BuiltIn {
  name: string;
  cron: string;
  job: string;
  /** Only runs once the setup wizard has finished (needs Plex + Tautulli). */
  needsSetup?: boolean;
}

/** Housekeeping that every install runs. Campaign schedules join this loop in a later phase. */
const BUILT_IN: BuiltIn[] = [
  { name: 'backup', cron: '30 3 * * *', job: 'backup' },
  { name: 'maintenance', cron: '15 4 * * *', job: 'maintenance' },
  { name: 'sync.people', cron: '7 */6 * * *', job: 'sync.people', needsSetup: true },
  { name: 'sync.history', cron: '*/15 * * * *', job: 'sync.history', needsSetup: true },
  { name: 'arrivals.check', cron: '5,20,35,50 * * * *', job: 'arrivals.check', needsSetup: true },
  // After the morning history sync, so last night's plays count before anyone is nudged or warned.
  { name: 'lifecycle.evaluate', cron: '40 10 * * *', job: 'lifecycle.evaluate', needsSetup: true },
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
    const ready = isSetupComplete(this.db);
    for (const s of BUILT_IN) {
      if (s.needsSetup && !ready) continue;
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

  /** Enabled campaigns with a due occurrence get one run each (unique per occurrence). */
  tickCampaigns(now = Date.now()): void {
    if (!isSetupComplete(this.db)) return;
    const tz = this.timezone();
    for (const c of this.db.select().from(campaigns).where(eq(campaigns.enabled, true)).all().filter((x) => x.kind === 'digest')) {
      try {
        const due = dueOccurrence(c.cron, tz, c.lastOccurrence ?? c.updatedAt, now);
        if (due.skipped > 0) log.warn(`campaign ${c.name}: skipped ${due.skipped} missed send(s)`);
        if (due.occurrence === null) continue;
        this.db.transaction(() => {
          const run = createRun(this.db, c, 'schedule', new Date(due.occurrence!).toISOString(), now);
          if (run) this.queue.enqueue('campaign.run', { runId: run.id }, { dedupeKey: `run:${run.id}` });
          this.db.update(campaigns).set({ lastOccurrence: due.occurrence }).where(eq(campaigns.id, c.id)).run();
        });
      } catch (err) {
        log.error(`campaign ${c.name} schedule failed`, { error: errorMessage(err) });
      }
    }
  }

  start(): void {
    this.tick();
    this.tickCampaigns();
    this.timer = setInterval(() => {
      this.tick();
      this.tickCampaigns();
    }, TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
