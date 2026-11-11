import { and, asc, desc, eq, gte, inArray, like, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { type Category, CATEGORIES, type Level, LEVELS } from './activity-classify';
import type { Db } from './db';
import { auditLog, campaigns, deliveries, people, providerEvents, runs } from './db/schema';

/**
 * The Activity log: every admin action, automatic decision, send and failure, as one stream of
 * events with a level (error, warning, info) and a category. Built on audit_log; sends are enriched
 * with their run, deliveries and provider events. Kept for 2 years or 2 GB, whichever comes first.
 */

export type { Category, Level } from './activity-classify';

const DAY = 86_400_000;
export const RETENTION = { maxAgeMs: 730 * DAY, maxBytes: 2 * 1024 ** 3 };

type Row = typeof auditLog.$inferSelect;

export interface ActivityEvent {
  id: string;
  at: number;
  level: Level;
  category: Category;
  actor: string;
  /** "Playbill" for automatic events, "A recipient" for unsubscribe links, else the admin's Plex name. */
  actorLabel: string;
  action: string;
  title: string;
  target: string | null;
  /** Where the target lives in the app, when it's a page (a person, Settings, Library). */
  targetHref: string | null;
  targetLabel: string | null;
}

const KIND_NAMES: Record<string, string> = { digest: 'weekly digest', arrivals: 'new-arrivals alert', recap: 'monthly recap', leaving: 'leaving-soon notice', lifecycle: 'account notice' };
const STATE_NAMES: Record<string, string> = { digest: 'weekly digest', arrivals: 'new-arrivals alerts', recap: 'monthly recap' };

interface Lookups {
  names: Map<string, string>;
  runKinds: Map<string, { kind: string; trigger: string }>;
}

function lookups(db: Db, rows: Row[]): Lookups {
  const targets = [...new Set(rows.map((r) => r.target).filter((t): t is string => !!t))];
  const names = new Map<string, string>();
  const runKinds = new Map<string, { kind: string; trigger: string }>();
  for (let i = 0; i < targets.length; i += 500) {
    const chunk = targets.slice(i, i + 500);
    for (const p of db.select({ id: people.plexUserId, name: people.displayName }).from(people).where(inArray(people.plexUserId, chunk)).all()) names.set(p.id, p.name);
    for (const r of db.select({ id: runs.id, kind: campaigns.kind, trigger: runs.trigger }).from(runs).innerJoin(campaigns, eq(campaigns.id, runs.campaignId)).where(inArray(runs.id, chunk)).all())
      runKinds.set(r.id, { kind: r.kind, trigger: r.trigger });
  }
  return { names, runKinds };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
const fmtDate = (ts: number) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(ts);

/** A sentence for the event, in the owner's terms: what happened, to whom. */
export function describe(r: Row, l: Lookups): Pick<ActivityEvent, 'title' | 'targetHref' | 'targetLabel' | 'actorLabel'> {
  const a = (r.after ?? {}) as Record<string, unknown>;
  const who = r.target ? (l.names.get(r.target) ?? (r.target.startsWith('invite:') ? 'a pending invite' : 'someone')) : 'someone';
  const person = r.target && l.names.has(r.target) ? { targetHref: `/people/${encodeURIComponent(r.target)}`, targetLabel: l.names.get(r.target)! } : { targetHref: null, targetLabel: null };
  const run = r.target ? l.runKinds.get(r.target) : undefined;
  const kind = run ? (KIND_NAMES[run.kind] ?? run.kind) : 'email';
  const actorLabel = r.actor === 'playbill' ? 'Playbill' : r.actor === 'recipient' ? 'A recipient' : r.actor;
  const base = { actorLabel, targetHref: null as string | null, targetLabel: null as string | null };
  const [area, verb] = [r.action.split('.')[0]!, r.action.slice(r.action.indexOf('.') + 1)];

  switch (r.action) {
    case 'campaign.sent': {
      const sent = Number(a.sent ?? 0);
      const failed = Number(a.failed ?? 0);
      const head = run?.trigger === 'test' ? `Test ${kind} sent` : `${kind[0]!.toUpperCase()}${kind.slice(1)} sent to ${plural(sent, 'person', 'people')}`;
      return { ...base, title: failed ? `${head}; ${plural(failed, 'delivery')} failed` : head };
    }
    case 'campaign.deferred':
      return { ...base, title: `${kind[0]!.toUpperCase()}${kind.slice(1)} is waiting: ${String(a.note ?? 'held for later')}` };
    case 'digest.send.test':
    case 'arrivals.send.test':
    case 'recap.send.test':
      return { ...base, title: `Sent a test of the ${STATE_NAMES[area] ?? area}` };
    case 'digest.send.live':
      return { ...base, title: 'Sent the weekly digest to everyone' };
    case 'digest.state':
    case 'arrivals.state':
    case 'recap.state': {
      const name = STATE_NAMES[area] ?? area;
      if ('mode' in a) return { ...base, title: a.mode === 'live' ? `Switched the ${name} to live` : `Put the ${name} in test mode` };
      return { ...base, title: a.enabled ? `Turned on the ${name}` : `Paused the ${name}` };
    }
    case 'digest.settings':
    case 'arrivals.settings':
      return { ...base, title: `Changed the ${STATE_NAMES[area]}'s settings`, targetHref: '/newsletters', targetLabel: 'Newsletters' };
    case 'preferences.update':
      return { ...base, ...person, title: `${who} changed their email preferences` };
    case 'preferences.one-click':
      return { ...base, ...person, title: `${who} unsubscribed from ${String(a.topic ?? 'an email')} with one click` };
    case 'person.update':
      return { ...base, ...person, title: `Updated ${who}'s notes` };
    case 'plex.remove':
      return { ...base, ...person, title: `Removed ${who}'s access to the server` };
    case 'plex.reinvite':
      return { ...base, ...person, title: `Invited ${who} back` };
    case 'plex.libraries':
      return { ...base, ...person, title: `Changed ${who}'s libraries` };
    case 'plex.invite.cancel':
      return { ...base, ...person, title: `Withdrew the invite to ${who}` };
    case 'lifecycle.nudge':
      return { ...base, ...person, title: `Sent ${who} a nudge` };
    case 'lifecycle.nudge.queued':
      return { ...base, ...person, title: `Nudging ${who}: no plays in ${plural(Number(a.idleDays ?? 0), 'day')}` };
    case 'lifecycle.warning.queued':
      return { ...base, ...person, title: `Warning ${who} their access will end${a.deadline ? ` on ${fmtDate(Number(a.deadline))}` : ''}` };
    case 'lifecycle.removal.proposed':
      return { ...base, ...person, title: `Proposed removing ${who}: waiting for your approval` };
    case 'lifecycle.removal.approve':
      return { ...base, ...person, title: `Approved removing ${who}` };
    case 'lifecycle.removal.keep':
      return { ...base, ...person, title: a.exempt ? `Kept ${who} and marked them exempt` : `Kept ${who}` };
    case 'library.leaving.plan': {
      const titles = Array.isArray(a.titles) ? (a.titles as string[]) : [];
      const when = a.removeAt ? ` for ${fmtDate(Number(a.removeAt))}` : '';
      return { ...base, title: `Planned ${titles.length === 1 ? titles[0] : plural(titles.length, 'title')} to leave${when}`, targetHref: '/library', targetLabel: 'Library' };
    }
    case 'library.leaving.removed':
      return { ...base, title: 'Marked a title as removed', targetHref: '/library', targetLabel: 'Library' };
    case 'library.leaving.cancelled':
      return { ...base, title: 'Cancelled a planned removal', targetHref: '/library', targetLabel: 'Library' };
    case 'settings.general':
      return { ...base, title: 'Changed the general settings', targetHref: '/settings', targetLabel: 'Settings' };
    case 'settings.email':
      return { ...base, title: 'Changed how email is sent', targetHref: '/settings', targetLabel: 'Settings' };
    case 'settings.lifecycle':
      return { ...base, title: 'Changed the housekeeping rules', targetHref: '/settings', targetLabel: 'Settings' };
    case 'settings.integration.add':
      return { ...base, title: `Connected ${String(a.kind ?? 'a service')}`, targetHref: '/settings', targetLabel: 'Settings' };
    case 'settings.integration.remove':
      return { ...base, title: 'Removed a connection', targetHref: '/settings', targetLabel: 'Settings' };
    case 'setup.owner':
      return { ...base, title: 'Signed in as the server owner and set up Playbill' };
    case 'setup.server':
      return { ...base, title: `Picked the Plex server${a.name ? ` ${String(a.name)}` : ''}` };
    case 'setup.tautulli':
      return { ...base, title: 'Connected Tautulli' };
    case 'job.failed':
      return { ...base, title: `${String(r.target ?? 'A background job')} failed: ${String(a.error ?? 'unknown error').slice(0, 160)}` };
    default:
      return { ...base, title: `${area} ${verb.replace(/[._-]/g, ' ')}` };
  }
}

function toEvents(db: Db, rows: Row[]): ActivityEvent[] {
  const l = lookups(db, rows);
  return rows.map((r) => ({ id: r.id, at: r.at, level: r.level, category: r.category, actor: r.actor, action: r.action, target: r.target, ...describe(r, l) }));
}

// ---------------------------------------------------------------------------------------------
// Search: free text plus key:value tokens, like a log search box.

export interface ActivityFilter {
  since: number | null;
  until?: number | null;
  levels?: Level[];
  categories?: Category[];
  actor?: string | null;
  action?: string | null;
  text?: string;
}

const LEVEL_ALIASES: Record<string, Level> = { error: 'error', errors: 'error', warning: 'warning', warnings: 'warning', warn: 'warning', info: 'info' };

/** `actor:darth5vader type:email level:error action:digest.* plus free words` → filter parts. Unknown keys stay as text. */
export function parseSearch(q: string): { actor: string | null; action: string | null; levels: Level[]; categories: Category[]; text: string } {
  const out = { actor: null as string | null, action: null as string | null, levels: [] as Level[], categories: [] as Category[], text: '' };
  const words: string[] = [];
  for (const tok of q.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []) {
    const m = /^(actor|by|type|category|level|is|action):(.+)$/i.exec(tok);
    const v = m?.[2]?.replace(/^"|"$/g, '').toLowerCase();
    if (!m || !v) {
      words.push(tok.replace(/^"|"$/g, ''));
      continue;
    }
    const key = m[1]!.toLowerCase();
    if (key === 'actor' || key === 'by') out.actor = v;
    else if (key === 'action') out.action = v;
    else if ((key === 'level' || key === 'is') && LEVEL_ALIASES[v]) out.levels.push(LEVEL_ALIASES[v]);
    else if ((key === 'type' || key === 'category') && (CATEGORIES as readonly string[]).includes(v)) out.categories.push(v as Category);
    else words.push(tok);
  }
  out.text = words.join(' ').trim();
  return out;
}

function where(f: ActivityFilter, skip: { levels?: boolean } = {}): SQL | undefined {
  const parts: SQL[] = [];
  if (f.since !== null) parts.push(gte(auditLog.at, f.since));
  if (f.until) parts.push(lt(auditLog.at, f.until));
  if (!skip.levels && f.levels?.length) parts.push(inArray(auditLog.level, f.levels));
  if (f.categories?.length) parts.push(inArray(auditLog.category, f.categories));
  if (f.actor) {
    const v = f.actor.toLowerCase();
    if (v === 'playbill' || v === 'system') parts.push(eq(auditLog.actor, 'playbill'));
    else if (v === 'recipient') parts.push(eq(auditLog.actor, 'recipient'));
    else parts.push(sql`lower(${auditLog.actor}) = ${v}`);
  }
  if (f.action) parts.push(like(auditLog.action, f.action.replace(/\*/g, '%')));
  return parts.length ? and(...parts) : undefined;
}

const matches = (e: ActivityEvent, text: string) => {
  const hay = `${e.title} ${e.actorLabel} ${e.action} ${e.targetLabel ?? ''}`.toLowerCase();
  return text.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
};

/** Newest first, `limit` at a time; `before` is the last event of the previous page. */
export function listActivity(db: Db, f: ActivityFilter, opts: { limit?: number; before?: { at: number; id: string } | null } = {}): { events: ActivityEvent[]; more: boolean } {
  const limit = opts.limit ?? 50;
  const cursor = opts.before ? or(lt(auditLog.at, opts.before.at), and(eq(auditLog.at, opts.before.at), lt(auditLog.id, opts.before.id))) : undefined;
  const base = and(where(f), cursor);
  if (!f.text) {
    const rows = db.select().from(auditLog).where(base).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(limit + 1).all();
    return { events: toEvents(db, rows.slice(0, limit)), more: rows.length > limit };
  }
  // Free text matches the described sentence, which isn't stored: scan in batches until a page fills.
  const found: ActivityEvent[] = [];
  let last = opts.before ?? null;
  for (let scanned = 0; found.length <= limit && scanned < 20_000; ) {
    const c = last ? or(lt(auditLog.at, last.at), and(eq(auditLog.at, last.at), lt(auditLog.id, last.id))) : undefined;
    const rows = db.select().from(auditLog).where(and(where(f), c)).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(500).all();
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const e of toEvents(db, rows)) if (matches(e, f.text)) found.push(e);
    const tail = rows[rows.length - 1]!;
    last = { at: tail.at, id: tail.id };
  }
  return { events: found.slice(0, limit), more: found.length > limit };
}

/** Events per level for the current filters (ignoring the level filter itself, so the chips can show all three). */
export function activityCounts(db: Db, f: ActivityFilter): Record<Level | 'all', number> {
  const out: Record<Level | 'all', number> = { all: 0, error: 0, warning: 0, info: 0 };
  if (f.text) {
    const { events } = listActivity(db, { ...f, levels: [] }, { limit: 20_000 });
    for (const e of events) out[e.level]++;
  } else {
    for (const r of db.select({ level: auditLog.level, n: sql<number>`count(*)` }).from(auditLog).where(where(f, { levels: true })).groupBy(auditLog.level).all()) out[r.level] = r.n;
  }
  out.all = out.error + out.warning + out.info;
  return out;
}

/** Event counts per time bucket, split into errors, warnings and the rest, for the volume chart. */
export function activityHistogram(db: Db, f: ActivityFilter, start: number, end: number, buckets: number) {
  const size = Math.max(1, Math.ceil((end - start) / buckets));
  const series = { error: Array<number>(buckets).fill(0), warning: Array<number>(buckets).fill(0), info: Array<number>(buckets).fill(0) };
  const rows = f.text
    ? listActivity(db, { ...f, since: start }, { limit: 20_000 }).events.map((e) => ({ at: e.at, level: e.level }))
    : db.select({ at: auditLog.at, level: auditLog.level }).from(auditLog).where(and(where({ ...f, since: start }), lte(auditLog.at, end))).all();
  for (const r of rows) {
    const i = Math.min(buckets - 1, Math.floor((r.at - start) / size));
    if (i >= 0) series[r.level][i]!++;
  }
  return { start, size, ...series };
}

// ---------------------------------------------------------------------------------------------
// One event, with its context.

export interface Change {
  path: string;
  before: unknown;
  after: unknown;
}

function flatten(v: unknown, prefix = '', out = new Map<string, unknown>()): Map<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0 && prefix) out.set(prefix, {});
    for (const [k, val] of entries) flatten(val, prefix ? `${prefix}.${k}` : k, out);
  } else if (prefix) out.set(prefix, v);
  return out;
}

/** Field-by-field before → after. Fields that didn't change are left out. */
export function changesOf(before: unknown, after: unknown): Change[] {
  if (before === null && (after === null || typeof after !== 'object')) return after === null ? [] : [{ path: 'value', before: null, after }];
  const b = flatten(before);
  const a = flatten(after);
  const keys = [...new Set([...b.keys(), ...a.keys()])].sort();
  return keys.filter((k) => JSON.stringify(b.get(k)) !== JSON.stringify(a.get(k))).map((k) => ({ path: k, before: b.has(k) ? b.get(k) : undefined, after: a.has(k) ? a.get(k) : undefined }));
}

export interface ActivityDetail {
  event: ActivityEvent;
  before: unknown;
  after: unknown;
  changes: Change[];
  run: {
    id: string;
    kind: string;
    trigger: string;
    status: string;
    note: string | null;
    createdAt: number;
    counts: Record<string, number>;
    deliveries: { id: string; name: string; email: string; plexUserId: string | null; status: string; error: string | null; sentAt: number | null; events: { type: string; at: number }[] }[];
  } | null;
  /** The events around this one (same day), oldest first, this one included: the breadcrumb trail. */
  nearby: ActivityEvent[];
}

export function activityEvent(db: Db, id: string): ActivityDetail | null {
  const row = db.select().from(auditLog).where(eq(auditLog.id, id)).get();
  if (!row) return null;
  const [event] = toEvents(db, [row]);
  const before = db.select().from(auditLog).where(and(gte(auditLog.at, row.at - DAY), or(lt(auditLog.at, row.at), and(eq(auditLog.at, row.at), lt(auditLog.id, row.id))))).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(8).all();
  const after = db.select().from(auditLog).where(and(lte(auditLog.at, row.at + DAY), or(sql`${auditLog.at} > ${row.at}`, and(eq(auditLog.at, row.at), sql`${auditLog.id} > ${row.id}`)))).orderBy(asc(auditLog.at), asc(auditLog.id)).limit(4).all();
  const nearby = toEvents(db, [...before.reverse(), row, ...after]);

  let run: ActivityDetail['run'] = null;
  const r = row.target ? db.select({ run: runs, kind: campaigns.kind }).from(runs).innerJoin(campaigns, eq(campaigns.id, runs.campaignId)).where(eq(runs.id, row.target)).get() : undefined;
  if (r) {
    const ds = db.select().from(deliveries).where(eq(deliveries.runId, r.run.id)).orderBy(asc(deliveries.name)).all();
    const providerIds = ds.map((d) => d.providerId).filter((x): x is string => !!x);
    const evs = providerIds.length ? db.select().from(providerEvents).where(inArray(providerEvents.providerId, providerIds)).orderBy(asc(providerEvents.at)).all() : [];
    const byProvider = new Map<string, { type: string; at: number }[]>();
    for (const e of evs) if (e.providerId) byProvider.set(e.providerId, [...(byProvider.get(e.providerId) ?? []), { type: e.type, at: e.at }]);
    const counts: Record<string, number> = {};
    for (const d of ds) counts[d.status] = (counts[d.status] ?? 0) + 1;
    run = {
      id: r.run.id,
      kind: r.kind,
      trigger: r.run.trigger,
      status: r.run.status,
      note: r.run.note,
      createdAt: r.run.createdAt,
      counts,
      deliveries: ds.map((d) => ({ id: d.id, name: d.name, email: d.email, plexUserId: d.plexUserId, status: d.status, error: d.error, sentAt: d.sentAt, events: d.providerId ? (byProvider.get(d.providerId) ?? []) : [] })),
    };
  }
  return { event: event!, before: row.before, after: row.after, changes: changesOf(row.before, row.after), run, nearby };
}

/** How many events are newer than `since` for these filters: the "new events" bar. */
export function newerCount(db: Db, f: ActivityFilter, since: number): number {
  return db.select({ n: sql<number>`count(*)` }).from(auditLog).where(and(where({ ...f, since: null }), sql`${auditLog.at} > ${since}`)).get()?.n ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Retention: 2 years or 2 GB of log data, whichever comes first.

const LOG_TABLES = ['audit_log', 'runs', 'deliveries', 'provider_events'];

/** Bytes the log tables and their indexes occupy (SQLite's dbstat; freed pages are reused, not counted). */
export function logBytes(db: Db): number {
  const list = LOG_TABLES.map((t) => `'${t}'`).join(', ');
  try {
    return db.get<{ b: number | null }>(sql.raw(`select sum(d.pgsize) as b from dbstat d join sqlite_master m on m.name = d.name where m.tbl_name in (${list})`))?.b ?? 0;
  } catch {
    // Builds without dbstat: estimate from the stored text.
    const est = db.get<{ b: number | null }>(
      sql.raw(
        `select (select coalesce(sum(length(coalesce(before,'')) + length(coalesce(after,'')) + 120), 0) from audit_log) + (select coalesce(sum(length(coalesce(content,'')) + 160), 0) from runs) + (select coalesce(sum(length(email) + length(name) + length(coalesce(error,'')) + 160), 0) from deliveries) + (select coalesce(sum(length(payload) + 100), 0) from provider_events) as b`,
      ),
    );
    return est?.b ?? 0;
  }
}

function deleteOlderThan(db: Db, cutoff: number): number {
  let n = 0;
  db.transaction((tx) => {
    n += tx.delete(providerEvents).where(lt(providerEvents.at, cutoff)).run().changes;
    n += tx.delete(auditLog).where(lt(auditLog.at, cutoff)).run().changes;
    // Finished runs only: a run still waiting to send is never dropped. Deliveries go with their run.
    const old = tx.select({ id: runs.id }).from(runs).where(and(lt(runs.createdAt, cutoff), inArray(runs.status, ['done', 'skipped', 'failed']))).all().map((r) => r.id);
    for (let i = 0; i < old.length; i += 500) {
      const chunk = old.slice(i, i + 500);
      n += tx.delete(deliveries).where(inArray(deliveries.runId, chunk)).run().changes;
      n += tx.delete(runs).where(inArray(runs.id, chunk)).run().changes;
    }
  });
  return n;
}

/**
 * Drops log data older than two years, then, while the log still takes more than 2 GB, the oldest
 * week at a time. Runs nightly from the worker's maintenance job.
 */
export function pruneActivity(db: Db, now = Date.now(), limits = RETENTION): { deleted: number; bytes: number } {
  let deleted = deleteOlderThan(db, now - limits.maxAgeMs);
  let bytes = logBytes(db);
  for (let i = 0; i < 520 && bytes > limits.maxBytes; i++) {
    const oldest = Math.min(
      db.select({ at: sql<number>`min(${auditLog.at})` }).from(auditLog).get()?.at ?? now,
      db.select({ at: sql<number>`min(${runs.createdAt})` }).from(runs).where(inArray(runs.status, ['done', 'skipped', 'failed'])).get()?.at ?? now,
      db.select({ at: sql<number>`min(${providerEvents.at})` }).from(providerEvents).get()?.at ?? now,
    );
    if (oldest >= now) break;
    const n = deleteOlderThan(db, oldest + 7 * DAY);
    deleted += n;
    bytes = logBytes(db);
    if (n === 0) break;
  }
  return { deleted, bytes };
}

export { CATEGORIES, LEVELS };
