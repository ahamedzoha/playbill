import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { heartbeats } from './db/schema';

export const HEARTBEAT_MS = 15_000;
/** A worker silent for this long counts as down. */
export const HEARTBEAT_STALE_MS = 90_000;

export function beat(
  db: Db,
  process: string,
  info: { revision: string; version: string; startedAt: number; extra?: Record<string, unknown> },
): void {
  const now = Date.now();
  const row = {
    process,
    revision: info.revision,
    version: info.version,
    startedAt: info.startedAt,
    beatAt: now,
    info: info.extra ?? null,
  };
  db.insert(heartbeats)
    .values(row)
    .onConflictDoUpdate({ target: heartbeats.process, set: row })
    .run();
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  version: string;
  revision: string;
  worker: { revision: string; version: string; ageMs: number; startedAt: number } | null;
  setupComplete: boolean;
}

export function healthReport(
  db: Db,
  self: { version: string; revision: string },
  setupComplete: boolean,
  now = Date.now(),
): HealthReport {
  const hb = db.select().from(heartbeats).where(eq(heartbeats.process, 'worker')).get();
  const worker = hb
    ? { revision: hb.revision, version: hb.version, ageMs: now - hb.beatAt, startedAt: hb.startedAt }
    : null;
  const ok = !!worker && worker.ageMs < HEARTBEAT_STALE_MS;
  return { status: ok ? 'ok' : 'degraded', ...self, worker, setupComplete };
}
