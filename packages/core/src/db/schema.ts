import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Times are epoch milliseconds throughout. */

/** Small key/value store for instance settings written by the setup wizard. Values are JSON. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** External services Playbill reads from. `secret` is AES-GCM ciphertext (see crypto.ts). */
export const integrations = sqliteTable(
  'integrations',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['tautulli', 'seerr', 'sonarr', 'radarr'] }).notNull(),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    secret: text('secret').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastCheckAt: integer('last_check_at'),
    lastCheckOk: integer('last_check_ok', { mode: 'boolean' }),
    lastCheckMessage: text('last_check_message'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('integrations_kind_idx').on(t.kind)],
);

/** Plex accounts allowed into the admin UI. The server owner is added by the setup wizard. */
export const admins = sqliteTable('admins', {
  plexUserId: text('plex_user_id').primaryKey(),
  username: text('username').notNull(),
  email: text('email'),
  thumb: text('thumb'),
  role: text('role', { enum: ['owner', 'admin'] }).notNull(),
  addedAt: integer('added_at').notNull(),
  lastLoginAt: integer('last_login_at'),
});

/** Browser sessions. The cookie holds a random token; only its SHA-256 is stored. */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    plexUserId: text('plex_user_id')
      .notNull()
      .references(() => admins.plexUserId, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.plexUserId)],
);

/**
 * Durable job queue shared by the web and worker processes.
 * Claims are leases: a job whose lease ran out (its process died) is claimable again.
 */
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull().default('queued'),
    /** At most one queued/running job per key. */
    dedupeKey: text('dedupe_key'),
    runAt: integer('run_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    leaseUntil: integer('lease_until'),
    /** Random id of the claim; finishing a job requires it, so a stale process can't overwrite a re-claim. */
    leaseOwner: text('lease_owner'),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('jobs_status_run_idx').on(t.status, t.runAt),
    uniqueIndex('jobs_active_dedupe_idx')
      .on(t.dedupeKey)
      .where(sql`${t.status} in ('queued', 'running') and ${t.dedupeKey} is not null`),
  ],
);

/** Liveness of long-running processes, reported by /api/health. */
export const heartbeats = sqliteTable('heartbeats', {
  process: text('process').primaryKey(),
  revision: text('revision').notNull(),
  version: text('version').notNull(),
  startedAt: integer('started_at').notNull(),
  beatAt: integer('beat_at').notNull(),
  info: text('info', { mode: 'json' }).$type<Record<string, unknown>>(),
});

/** Last run of each built-in schedule, so a restart neither repeats nor forgets one. */
export const schedules = sqliteTable('schedules', {
  name: text('name').primaryKey(),
  lastOccurrence: integer('last_occurrence'),
  lastRunAt: integer('last_run_at'),
});

/** Raw webhook deliveries. Handlers only insert here; the worker processes them. */
export const inbox = sqliteTable(
  'inbox',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    externalKey: text('external_key').notNull(),
    payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
    receivedAt: integer('received_at').notNull(),
    processedAt: integer('processed_at'),
    error: text('error'),
  },
  (t) => [
    uniqueIndex('inbox_source_key_idx').on(t.source, t.externalKey),
    index('inbox_unprocessed_idx').on(t.processedAt),
  ],
);

/** Who did what, with before/after snapshots. Never pruned automatically. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    at: integer('at').notNull(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    before: text('before', { mode: 'json' }).$type<unknown>(),
    after: text('after', { mode: 'json' }).$type<unknown>(),
  },
  (t) => [index('audit_at_idx').on(t.at)],
);
