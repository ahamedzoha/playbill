import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, errorMessage, logger } from '@playbill/core';
import { audit } from '@playbill/core/audit';
import { backupDatabase } from '@playbill/core/backup';
import { crypto } from '@playbill/core/crypto';
import { getDb, getSqlite, openSqlite } from '@playbill/core/db';
import { migrationsDir, pendingMigrations, runMigrations } from '@playbill/core/db/migrate';
import { HEARTBEAT_MS, beat } from '@playbill/core/health';
import { Queue } from '@playbill/core/queue';
import { instanceClientId } from '@playbill/core/settings';
import { ensureSetupCode, isSetupComplete } from '@playbill/core/setup';
import { syncState } from '@playbill/core/db/schema';
import { eq } from 'drizzle-orm';
import { handlers } from './jobs';
import { runCli } from './cli';
import { Scheduler } from './scheduler';

const log = logger('worker');

// In the container the migrations are copied next to the bundle.
const bundled = join(dirname(fileURLToPath(import.meta.url)), 'drizzle');
if (!process.env.PLAYBILL_MIGRATIONS_DIR && existsSync(join(bundled, 'meta'))) {
  process.env.PLAYBILL_MIGRATIONS_DIR = bundled;
}

/** Migrates the database, backing it up first when it already holds data. */
async function migrate(): Promise<void> {
  const cfg = config();
  const fresh = !existsSync(cfg.dbPath);
  const sqlite = openSqlite(cfg.dbPath);
  try {
    const pending = pendingMigrations(sqlite, migrationsDir());
    if (pending.length === 0) return;
    if (!fresh) {
      const file = await backupDatabase(sqlite, join(cfg.configDir, 'backups'), `pre-${pending[0]}`);
      log.info(`backed up database before migrating`, { file });
    }
    runMigrations(sqlite, migrationsDir());
    log.info(`applied ${pending.length} migration(s)`, { pending });
  } finally {
    sqlite.close();
  }
}

async function main(): Promise<void> {
  const cfg = config();
  await migrate();
  if (process.argv.includes('--migrate-only')) return;
  if (process.argv[2] === 'config') {
    await runCli(process.argv.slice(2));
    return;
  }

  const db = getDb();
  instanceClientId(db);
  // Create secret.key at boot (not on first use) so backups of /config always include it.
  crypto();
  const setupCode = ensureSetupCode(db);
  if (setupCode) {
    log.info('──────────────────────────────────────────────');
    log.info(`Playbill is not set up yet. Setup code: ${setupCode}`);
    log.info(`Open Playbill in a browser and enter this code. It is also in ${cfg.configDir}/setup-code.txt`);
    log.info('──────────────────────────────────────────────');
  }
  const queue = new Queue(db);
  const startedAt = Date.now();
  const self = { revision: cfg.revision, version: cfg.version || '0.0.0-dev', startedAt };

  beat(db, 'worker', self);
  const heartbeat = setInterval(() => {
    try {
      beat(db, 'worker', { ...self, extra: { jobs: queue.counts() } });
    } catch (err) {
      log.error('heartbeat failed', { error: errorMessage(err) });
    }
  }, HEARTBEAT_MS);

  // First start after setup (or after an upgrade that added syncing): import everything now
  // rather than waiting for the schedule.
  if (isSetupComplete(db) && !db.select().from(syncState).where(eq(syncState.name, 'history')).get()) {
    queue.enqueue('sync.people', {}, { dedupeKey: 'schedule:sync.people' });
    queue.enqueue('sync.history', {}, { dedupeKey: 'schedule:sync.history', runAt: Date.now() + 5_000 });
  }

  const scheduler = new Scheduler(db, queue);
  scheduler.start();

  let stopping = false;
  let busy: Promise<void> | null = null;
  const types = Object.keys(handlers);

  const loop = async () => {
    while (!stopping) {
      const job = queue.claim(types);
      if (!job) {
        await new Promise((r) => setTimeout(r, 1_000));
        continue;
      }
      const run = (async () => {
        const started = Date.now();
        try {
          await handlers[job.type]!(job.payload, { db, queue, job });
          queue.complete(job);
          log.info(`job ${job.type} done`, { id: job.id, ms: Date.now() - started });
        } catch (err) {
          const retry = queue.fail(job, errorMessage(err));
          log.error(`job ${job.type} failed${retry ? ', will retry' : ''}`, { id: job.id, error: errorMessage(err) });
          // Only the final failure goes in the Activity log; retries would bury it.
          if (!retry) audit(db, { actor: 'playbill', action: 'job.failed', target: job.type, after: { error: errorMessage(err).slice(0, 2000), attempts: job.attempts + 1 } });
        }
      })();
      busy = run;
      await run;
      busy = null;
    }
  };
  const looping = loop();

  log.info(`started`, { revision: cfg.revision, configDir: cfg.configDir, demo: cfg.demoMode });

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info(`${signal}: finishing current job and stopping`);
    scheduler.stop();
    clearInterval(heartbeat);
    await Promise.race([Promise.all([busy, looping]), new Promise((r) => setTimeout(r, 15_000))]);
    getSqlite().close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  log.error('fatal', { error: errorMessage(err), stack: err instanceof Error ? err.stack : undefined });
  process.exit(1);
});

