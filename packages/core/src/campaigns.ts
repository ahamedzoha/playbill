import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from './audit';
import type { Db } from './db';
import { admins, campaigns, deliveries, people, runs } from './db/schema';
import { type DigestContent, type DigestSources, buildDigest, isEmptyDigest } from './digest';
import { buildRecap, recapRecipients, type RecapContent } from './recap';
import { newId } from './ids';
import { errorMessage, logger } from './log';
import { type MailProvider, type OutgoingEmail, PermanentSendError, QuotaExceededError } from './mail';
import { quotaState } from './quota';
import { getSetting } from './settings';
import { normalEmail, suppression, topicPreferences, type TopicId } from './topics';

const log = logger('campaigns');
const DAY = 86_400_000;

export const digestSettings = z.object({
  /** {server} is replaced with the server name. */
  subject: z.string().min(1).max(150),
  /** Optional note from the owner, shown above the lists. */
  intro: z.string().max(2000),
  signature: z.string().min(1).max(120),
  sections: z.object({ added: z.boolean(), coming: z.boolean(), requests: z.boolean(), stats: z.boolean() }),
  maxItems: z.number().int().min(3).max(24),
  /** Test mode sends only here. */
  testAddresses: z.array(z.string().email()).max(10),
  skipIfEmpty: z.boolean(),
});
export type DigestSettings = z.infer<typeof digestSettings>;
export type Campaign = typeof campaigns.$inferSelect;
export type Run = typeof runs.$inferSelect;

export const DEFAULT_DIGEST_CRON = '0 19 * * 4';

/** The one digest campaign, created on first use with safe defaults: disabled, test mode. */
export function ensureDigestCampaign(db: Db, now = Date.now()): Campaign {
  const existing = db.select().from(campaigns).where(eq(campaigns.kind, 'digest')).get();
  if (existing) return existing;
  const server = getSetting(db, 'plex')?.name ?? 'our Plex';
  const owner = db.select().from(admins).where(eq(admins.role, 'owner')).get();
  const settings: DigestSettings = {
    subject: 'New this week on {server}',
    intro: '',
    signature: server,
    sections: { added: true, coming: true, requests: true, stats: true },
    maxItems: 12,
    testAddresses: owner?.email ? [owner.email] : [],
    skipIfEmpty: true,
  };
  const row: Campaign = {
    id: newId('cmp'),
    kind: 'digest',
    name: 'Weekly digest',
    topic: 'digest',
    enabled: false,
    mode: 'test',
    cron: DEFAULT_DIGEST_CRON,
    settings,
    lastOccurrence: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(campaigns).values(row).run();
  return row;
}

export function campaignSettings(c: Campaign): DigestSettings {
  return digestSettings.parse(c.settings);
}

export interface Recipient {
  plexUserId: string | null;
  email: string;
  name: string;
}

export interface AudienceSummary {
  recipients: Recipient[];
  optedOut: number;
  suppressed: number;
  noEmail: number;
}

/** Everyone with access and an address, minus opt-outs and suppressions, one email per address. */
export function digestAudience(db: Db, topic: TopicId): AudienceSummary {
  const rows = db
    .select()
    .from(people)
    .where(inArray(people.status, ['shared', 'home', 'owner']))
    .all()
    .filter((p) => !p.plexUserId.startsWith('invite:'));
  const out: AudienceSummary = { recipients: [], optedOut: 0, suppressed: 0, noEmail: 0 };
  const seen = new Set<string>();
  for (const p of rows) {
    if (!p.email) {
      out.noEmail++;
      continue;
    }
    const email = normalEmail(p.email);
    if (seen.has(email)) continue;
    seen.add(email);
    if (suppression(db, email)) {
      out.suppressed++;
      continue;
    }
    if (!topicPreferences(db, p.plexUserId)[topic]) {
      out.optedOut++;
      continue;
    }
    out.recipients.push({ plexUserId: p.plexUserId, email, name: p.displayName });
  }
  return out;
}

/** Test recipients: names come from People when the address belongs to someone. */
export function testAudience(db: Db, addresses: string[]): Recipient[] {
  const all = db.select().from(people).all();
  return [...new Set(addresses.map(normalEmail))].map((email) => {
    const p = all.find((x) => x.email && normalEmail(x.email) === email);
    return { plexUserId: p?.plexUserId ?? null, email, name: p?.displayName ?? 'there' };
  });
}

export function createRun(db: Db, campaign: Campaign, trigger: Run['trigger'], windowKey: string, now = Date.now()): Run | null {
  const run: Run = {
    id: newId('run'),
    campaignId: campaign.id,
    windowKey,
    trigger,
    status: 'planned',
    content: null,
    note: null,
    createdAt: now,
    updatedAt: now,
  };
  const res = db.insert(runs).values(run).onConflictDoNothing().run();
  return res.changes > 0 ? run : null;
}

/** The previous run that actually went out, so a digest covers exactly the time since then. */
function lastSentWindowEnd(db: Db, campaignId: string, excludeRunId: string): number | null {
  const prev = db
    .select({ content: runs.content })
    .from(runs)
    .where(and(eq(runs.campaignId, campaignId), eq(runs.status, 'done'), inArray(runs.trigger, ['schedule', 'manual']), sql`${runs.id} != ${excludeRunId}`))
    .orderBy(desc(runs.createdAt))
    .limit(1)
    .get();
  const end = (prev?.content as DigestContent | undefined)?.windowEnd;
  return typeof end === 'number' ? end : null;
}

export interface RunDeps {
  sources: DigestSources;
  mailer: MailProvider | null;
  /** `items` is the delivery's personal subset (arrivals); null for emails everyone gets the same. */
  render: (content: DigestContent, recipient: Recipient, deliveryId: string, items: string[] | null, campaign: Campaign) => Promise<OutgoingEmail>;
  now?: () => number;
  /** Pause between sends, to stay well under provider rate limits. */
  pauseMs?: number;
  /** Called between sends; return false to stop (lost lease, shutdown). */
  keepGoing?: () => boolean;
}

export interface RunResult {
  status: Run['status'];
  sent: number;
  failed: number;
  /** When the run should be retried (deferred by the quota). */
  retryAt?: number;
}

function setRun(db: Db, id: string, patch: Partial<Run>) {
  db.update(runs).set({ ...patch, updatedAt: Date.now() }).where(eq(runs.id, id)).run();
}

/**
 * Moves a run forward from wherever it stopped. Every step is safe to repeat:
 * planned → frozen (content stored) → sending (deliveries inserted) → done.
 * A crash mid-send: with an idempotent provider the delivery is retried with the same key;
 * otherwise it becomes "unknown" and is left alone (never a duplicate email).
 */
export async function advanceRun(db: Db, runId: string, deps: RunDeps): Promise<RunResult> {
  const now = deps.now ?? Date.now;
  let run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) throw new Error(`run ${runId} not found`);
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, run.campaignId)).get();
  if (!campaign) throw new Error(`campaign for run ${runId} not found`);
  const isDigest = campaign.kind === 'digest';

  if (run.status === 'done' || run.status === 'skipped' || run.status === 'failed') return { status: run.status, sent: 0, failed: 0 };

  if (run.status === 'planned' && campaign.kind === 'recap') {
    const tz = getSetting(db, 'general')?.timezone ?? process.env.TZ ?? 'UTC';
    const content = buildRecap(db, now(), tz);
    setRun(db, run.id, { status: Object.keys(content.people).length ? 'frozen' : 'skipped', content: content as unknown as Record<string, unknown>, note: Object.keys(content.people).length ? null : 'Nobody watched anything last month' });
    if (!Object.keys(content.people).length) return { status: 'skipped', sent: 0, failed: 0 };
    run = { ...run, status: 'frozen', content: content as unknown as Record<string, unknown> };
  }

  if (run.status === 'planned' && isDigest) {
    const settings = campaignSettings(campaign);
    const until = now();
    const since = lastSentWindowEnd(db, campaign.id, run.id) ?? until - 7 * DAY;
    const content = await buildDigest(db, deps.sources, settings, Math.max(since, until - 14 * DAY), until);
    if (settings.skipIfEmpty && run.trigger === 'schedule' && isEmptyDigest(content)) {
      setRun(db, run.id, { status: 'skipped', content: content as unknown as Record<string, unknown>, note: 'Nothing new this week' });
      return { status: 'skipped', sent: 0, failed: 0 };
    }
    setRun(db, run.id, { status: 'frozen', content: content as unknown as Record<string, unknown> });
    run = { ...run, status: 'frozen', content: content as unknown as Record<string, unknown> };
  }

  if (!deps.mailer) {
    setRun(db, run.id, { status: 'deferred', note: 'Email is not set up yet' });
    return { status: 'deferred', sent: 0, failed: 0, retryAt: now() + 3_600_000 };
  }

  if (run.status === 'frozen' || run.status === 'deferred') {
    const t = now();
    // Arrivals runs are planned with their deliveries already in place (each person's own items).
    const testAddresses = (campaign.settings as { testAddresses?: string[] }).testAddresses ?? [];
    const recipients =
      campaign.kind === 'recap'
        ? run.trigger === 'test' || campaign.mode === 'test'
          ? testAudience(db, testAddresses)
          : recapRecipients(db, run.content as unknown as RecapContent)
        : !isDigest
          ? []
          : run.trigger === 'test' || campaign.mode === 'test'
            ? testAudience(db, campaignSettings(campaign).testAddresses)
            : digestAudience(db, campaign.topic as TopicId).recipients;
    db.transaction((tx) => {
      for (const r of recipients) {
        tx.insert(deliveries)
          .values({ id: newId('dlv'), runId: run!.id, plexUserId: r.plexUserId, email: r.email, name: r.name, status: 'pending', createdAt: t })
          .onConflictDoNothing()
          .run();
      }
    });
    // Never send half a digest: if the remaining allowance can't cover every pending delivery, wait.
    const pending = db.select({ n: sql<number>`count(*)` }).from(deliveries).where(and(eq(deliveries.runId, run.id), eq(deliveries.status, 'pending'))).get()?.n ?? 0;
    const quota = quotaState(db, t);
    if (pending > quota.remaining) {
      if (campaign.kind === 'arrivals') {
        // Alerts are only early news: when the allowance is short, drop them; the weekly digest covers them.
        db.update(deliveries)
          .set({ status: 'skipped', error: 'Over the sending allowance; the weekly digest will include it' })
          .where(and(eq(deliveries.runId, run.id), eq(deliveries.status, 'pending')))
          .run();
        setRun(db, run.id, { status: 'skipped', note: `Not sent: ${pending} emails needed, ${quota.remaining} left in the allowance` });
        return { status: 'skipped', sent: 0, failed: 0 };
      }
      setRun(db, run.id, { status: 'deferred', note: `Waiting for sending allowance: ${pending} to send, ${quota.remaining} left today` });
      return { status: 'deferred', sent: 0, failed: 0, retryAt: t + 3_600_000 };
    }
    setRun(db, run.id, { status: 'sending', note: null });
  }

  // Recover deliveries a crash left mid-send.
  db.update(deliveries)
    .set(deps.mailer.idempotent ? { status: 'pending' } : { status: 'unknown', error: 'Interrupted while sending; check the inbox before re-sending' })
    .where(and(eq(deliveries.runId, run.id), eq(deliveries.status, 'sending')))
    .run();

  const content = run.content as unknown as DigestContent;
  let sent = 0;
  let failed = 0;
  for (;;) {
    if (deps.keepGoing && !deps.keepGoing()) break;
    const d = db.select().from(deliveries).where(and(eq(deliveries.runId, run.id), eq(deliveries.status, 'pending'))).limit(1).get();
    if (!d) break;
    // A recipient may have unsubscribed or bounced since the run was planned.
    if (suppression(db, d.email)) {
      db.update(deliveries).set({ status: 'skipped', error: 'Suppressed' }).where(eq(deliveries.id, d.id)).run();
      continue;
    }
    db.update(deliveries).set({ status: 'sending', attempts: d.attempts + 1 }).where(eq(deliveries.id, d.id)).run();
    try {
      const email = await deps.render(content, { plexUserId: d.plexUserId, email: d.email, name: d.name }, d.id, d.items ?? null, campaign);
      const res = await deps.mailer.send(email);
      db.update(deliveries).set({ status: 'sent', providerId: res.id, sentAt: now(), error: null }).where(eq(deliveries.id, d.id)).run();
      sent++;
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        db.update(deliveries).set({ status: 'pending', error: errorMessage(err) }).where(eq(deliveries.id, d.id)).run();
        setRun(db, run.id, { status: 'deferred', note: `The email provider's limit was reached: ${errorMessage(err)}` });
        return { status: 'deferred', sent, failed, retryAt: now() + 3_600_000 };
      }
      const permanent = err instanceof PermanentSendError || d.attempts + 1 >= 3;
      db.update(deliveries)
        .set({ status: permanent ? 'failed' : 'pending', error: errorMessage(err).slice(0, 500) })
        .where(eq(deliveries.id, d.id))
        .run();
      log.warn('send failed', { delivery: d.id, permanent, error: errorMessage(err) });
      if (permanent) {
        failed++;
      } else {
        // Transient: back off and let the worker retry the run later, instead of hammering the provider.
        return { status: 'sending', sent, failed, retryAt: now() + 60_000 * (d.attempts + 1) };
      }
    }
    if (deps.pauseMs) await new Promise((r) => setTimeout(r, deps.pauseMs));
  }

  const left = db.select({ n: sql<number>`count(*)` }).from(deliveries).where(and(eq(deliveries.runId, run.id), eq(deliveries.status, 'pending'))).get()?.n ?? 0;
  if (left === 0) {
    setRun(db, run.id, { status: 'done' });
    audit(db, { actor: 'playbill', action: 'campaign.sent', target: run.id, after: { trigger: run.trigger, sent, failed } });
    return { status: 'done', sent, failed };
  }
  return { status: 'sending', sent, failed };
}

export function runSummary(db: Db, runId: string): Record<string, number> {
  const rows = db
    .select({ status: deliveries.status, n: sql<number>`count(*)` })
    .from(deliveries)
    .where(eq(deliveries.runId, runId))
    .groupBy(deliveries.status)
    .all();
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
