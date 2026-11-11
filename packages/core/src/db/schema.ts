import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

// ---------------------------------------------------------------------------------------------
// People and activity (P1). Synced from Tautulli and plex.tv; Playbill-only fields are marked.

/**
 * Everyone who has (or had) access to the server, keyed by Plex account id.
 * `status` is derived on every sync from plex.tv: owner, shared, pending (invited, not accepted),
 * home (Plex Home member), removed (in Tautulli history but no longer shared).
 */
export const people = sqliteTable(
  'people',
  {
    plexUserId: text('plex_user_id').primaryKey(),
    username: text('username').notNull(),
    /** Tautulli's friendly name (editable there), else the Plex title. */
    displayName: text('display_name').notNull(),
    email: text('email'),
    thumb: text('thumb'),
    status: text('status', { enum: ['owner', 'shared', 'pending', 'home', 'removed'] }).notNull(),
    invitedAt: integer('invited_at'),
    acceptedAt: integer('accepted_at'),
    /** plex.tv's last-seen for this user on our server (any client, including browsing). */
    plexLastSeenAt: integer('plex_last_seen_at'),
    /** Last play recorded by Tautulli. */
    lastPlayedAt: integer('last_played_at'),
    /** Tautulli's own flag for whether this user receives Tautulli notifications. */
    tautulliNotify: integer('tautulli_notify', { mode: 'boolean' }),
    /** Playbill-only: never nudge, warn or remove this person. */
    exempt: integer('exempt', { mode: 'boolean' }).notNull().default(false),
    /** Playbill-only: free-text admin note. */
    note: text('note'),
    firstSeenAt: integer('first_seen_at').notNull(),
    removedAt: integer('removed_at'),
    syncedAt: integer('synced_at').notNull(),
  },
  (t) => [index('people_status_idx').on(t.status), index('people_last_played_idx').on(t.lastPlayedAt)],
);

/** plex.tv share state per person: which libraries, which permissions. Snapshot for undo lives in lifecycle (P4). */
export const plexShares = sqliteTable('plex_shares', {
  plexUserId: text('plex_user_id')
    .primaryKey()
    .references(() => people.plexUserId, { onDelete: 'cascade' }),
  shareId: text('share_id'),
  allLibraries: integer('all_libraries', { mode: 'boolean' }).notNull(),
  sectionIds: text('section_ids', { mode: 'json' }).$type<string[]>().notNull(),
  allowSync: integer('allow_sync', { mode: 'boolean' }).notNull(),
  filters: text('filters', { mode: 'json' }).$type<Record<string, string>>(),
  pending: integer('pending', { mode: 'boolean' }).notNull().default(false),
  syncedAt: integer('synced_at').notNull(),
});

export const libraries = sqliteTable('libraries', {
  sectionId: text('section_id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  itemCount: integer('item_count'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  syncedAt: integer('synced_at').notNull(),
});

/**
 * Local copy of Tautulli history, one row per play as Tautulli groups them.
 * Keyed by Tautulli's `reference_id` (the first session of a group), which stays stable while a
 * group grows; rows are upserted so a resumed play updates its duration.
 */
export const watchHistory = sqliteTable(
  'watch_history',
  {
    id: integer('id').primaryKey(),
    plexUserId: text('plex_user_id').notNull(),
    startedAt: integer('started_at').notNull(),
    stoppedAt: integer('stopped_at'),
    /** Seconds actually watched (excludes pauses). */
    playSeconds: integer('play_seconds').notNull(),
    percentComplete: integer('percent_complete'),
    /** 1 watched, 0.5 partial, 0 barely started (Tautulli's watched_status). */
    watched: real('watched'),
    mediaType: text('media_type').notNull(),
    sectionId: text('section_id'),
    ratingKey: text('rating_key'),
    parentRatingKey: text('parent_rating_key'),
    grandparentRatingKey: text('grandparent_rating_key'),
    title: text('title').notNull(),
    parentTitle: text('parent_title'),
    grandparentTitle: text('grandparent_title'),
    fullTitle: text('full_title'),
    year: integer('year'),
    seasonNumber: integer('season_number'),
    episodeNumber: integer('episode_number'),
    guid: text('guid'),
    thumb: text('thumb'),
    platform: text('platform'),
    player: text('player'),
    product: text('product'),
    ipAddress: text('ip_address'),
    /** direct play, copy (direct stream) or transcode. */
    transcodeDecision: text('transcode_decision'),
    location: text('location'),
    relayed: integer('relayed', { mode: 'boolean' }),
    live: integer('live', { mode: 'boolean' }),
  },
  (t) => [
    index('wh_user_started_idx').on(t.plexUserId, t.startedAt),
    index('wh_started_idx').on(t.startedAt),
    index('wh_grandparent_idx').on(t.grandparentRatingKey),
    index('wh_section_idx').on(t.sectionId),
  ],
);

/** Progress of each sync, so a restart resumes instead of starting over. */
export const syncState = sqliteTable('sync_state', {
  name: text('name').primaryKey(),
  /** Free-form cursor, e.g. { backfillDone: true, newestStartedAt: 123 }. */
  cursor: text('cursor', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  lastRunAt: integer('last_run_at'),
  lastOkAt: integer('last_ok_at'),
  lastError: text('last_error'),
});

// ---------------------------------------------------------------------------------------------
// Newsletters (P2). A campaign is a recurring email; each occurrence is a run; each recipient of a
// run is a delivery. Unique keys make every step safe to repeat after a crash.

/** Per-person opt-out by topic. A missing row means the topic's default (subscribed). */
export const preferences = sqliteTable(
  'preferences',
  {
    plexUserId: text('plex_user_id').notNull(),
    topic: text('topic').notNull(),
    subscribed: integer('subscribed', { mode: 'boolean' }).notNull(),
    updatedAt: integer('updated_at').notNull(),
    /** 'recipient' (they clicked), 'owner' (set in the admin UI), 'import'. */
    source: text('source').notNull(),
  },
  (t) => [uniqueIndex('preferences_person_topic_idx').on(t.plexUserId, t.topic)],
);

/** Addresses that must never be mailed: unsubscribe-all, hard bounce, spam complaint, manual. */
export const suppressions = sqliteTable('suppressions', {
  email: text('email').primaryKey(),
  reason: text('reason', { enum: ['unsubscribed', 'bounced', 'complained', 'manual'] }).notNull(),
  detail: text('detail'),
  at: integer('at').notNull(),
});

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['digest', 'arrivals'] }).notNull(),
  name: text('name').notNull(),
  topic: text('topic').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  /**
   * 'test' sends only to the test addresses; 'live' sends to the audience.
   * New campaigns start in test mode; only the owner can switch to live.
   */
  mode: text('mode', { enum: ['test', 'live'] }).notNull().default('test'),
  cron: text('cron').notNull(),
  /** Campaign settings: sections, subject, intro, test addresses. Validated by zod in campaigns.ts. */
  settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  lastOccurrence: integer('last_occurrence'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    /** One run per campaign occurrence (ISO time), or 'manual:<id>' for a send-now/test. */
    windowKey: text('window_key').notNull(),
    trigger: text('trigger', { enum: ['schedule', 'manual', 'test'] }).notNull(),
    status: text('status', { enum: ['planned', 'frozen', 'sending', 'done', 'deferred', 'failed', 'skipped'] }).notNull(),
    /** The content snapshot every delivery of this run renders from, so retries send the same email. */
    content: text('content', { mode: 'json' }).$type<Record<string, unknown>>(),
    note: text('note'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('runs_campaign_window_idx').on(t.campaignId, t.windowKey), index('runs_status_idx').on(t.status)],
);

export const deliveries = sqliteTable(
  'deliveries',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    plexUserId: text('plex_user_id'),
    email: text('email').notNull(),
    name: text('name').notNull(),
    /**
     * pending → sending → sent | failed | unknown. 'unknown' = the process died mid-send over a
     * provider without idempotency; never re-sent automatically.
     */
    status: text('status', { enum: ['pending', 'sending', 'sent', 'failed', 'unknown', 'skipped'] }).notNull(),
    providerId: text('provider_id'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    sentAt: integer('sent_at'),
    /** For personal emails (arrivals): which of the run's items this person gets. */
    items: text('items', { mode: 'json' }).$type<string[]>(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('deliveries_run_email_idx').on(t.runId, t.email),
    index('deliveries_status_idx').on(t.status),
    index('deliveries_sent_idx').on(t.sentAt),
  ],
);

/** Delivery webhooks from the email provider (bounces, complaints), deduplicated by provider event id. */
export const providerEvents = sqliteTable('provider_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  email: text('email'),
  providerId: text('provider_id'),
  at: integer('at').notNull(),
  payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
});

/**
 * Everything Playbill has seen arrive in Plex, one row per Plex item (film, episode, season, show).
 * Recorded once, so a quality upgrade or a re-scan never alerts twice. `alertRunId` is set when the
 * item was included in an arrivals email run (or marked as backlog on first sync).
 */
export const arrivals = sqliteTable(
  'arrivals',
  {
    ratingKey: text('rating_key').primaryKey(),
    kind: text('kind', { enum: ['movie', 'episode', 'season', 'show'] }).notNull(),
    /** Plex key of the show for episodes/seasons; the item itself for films and shows. */
    groupKey: text('group_key').notNull(),
    title: text('title').notNull(),
    groupTitle: text('group_title').notNull(),
    season: integer('season'),
    episode: integer('episode'),
    year: integer('year'),
    image: text('image', { mode: 'json' }).$type<Record<string, unknown>>(),
    library: text('library'),
    addedAt: integer('added_at').notNull(),
    seenAt: integer('seen_at').notNull(),
    /** Plex ids of people who requested it in Seerr (they already got Seerr's email). */
    requestedBy: text('requested_by', { mode: 'json' }).$type<string[]>(),
    alertRunId: text('alert_run_id'),
  },
  (t) => [index('arrivals_pending_idx').on(t.alertRunId), index('arrivals_group_idx').on(t.groupKey)],
);
