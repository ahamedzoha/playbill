import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activityCounts, activityEvent, changesOf, listActivity, logBytes, parseSearch, pruneActivity } from './activity';
import { categoryOf, levelOf } from './activity-classify';
import { audit } from './audit';
import { migrationsDir, openTestDb } from './db/migrate';
import { auditLog, campaigns, deliveries, people, runs } from './db/schema';

const DAY = 86_400_000;
const base = { thumb: null, email: null, plexLastSeenAt: null, tautulliNotify: null, removedAt: null, syncedAt: 0, invitedAt: 0, acceptedAt: 0, lastPlayedAt: null, firstSeenAt: 0 };

describe('classify', () => {
  it('matches the backfill in migration 0006 for every action Playbill writes', () => {
    const { sqlite } = openTestDb();
    const cases: [string, unknown][] = [
      ['digest.state', { mode: 'live' }],
      ['campaign.sent', { sent: 41, failed: 0 }],
      ['campaign.sent', { sent: 3, failed: 2 }],
      ['campaign.sent', { sent: 0, failed: 5 }],
      ['campaign.deferred', { note: 'x' }],
      ['plex.remove', null],
      ['lifecycle.warning.queued', { idleDays: 170 }],
      ['lifecycle.nudge', null],
      ['library.leaving.plan', { titles: [] }],
      ['settings.email', null],
      ['setup.owner', null],
      ['job.failed', { error: 'boom' }],
      ['preferences.one-click', { topic: 'digest' }],
      ['maintenance.odd', null],
    ];
    const backfill = readFileSync(join(migrationsDir(), '0006_activity.sql'), 'utf8').split('--> statement-breakpoint').pop()!;
    cases.forEach(([action, after], i) => {
      sqlite.prepare("insert into audit_log (id, at, actor, action, after, level, category) values (?, 0, 'x', ?, ?, 'info', 'system')").run(`t${i}`, action, after === null ? null : JSON.stringify(after));
    });
    sqlite.exec(backfill);
    const rows = sqlite.prepare('select id, action, after, level, category from audit_log').all() as { id: string; action: string; after: string | null; level: string; category: string }[];
    for (const r of rows) {
      const after = r.after ? JSON.parse(r.after) : null;
      expect([r.action, r.level, r.category]).toEqual([r.action, levelOf(r.action, after), categoryOf(r.action)]);
    }
  });
});

describe('parseSearch', () => {
  it('reads key:value tokens and keeps the rest as text', () => {
    expect(parseSearch('actor:Zed type:email is:errors digest "two words"')).toEqual({ actor: 'zed', action: null, levels: ['error'], categories: ['email'], text: 'digest two words' });
    expect(parseSearch('action:digest.* colour:red')).toMatchObject({ action: 'digest.*', text: 'colour:red' });
  });
});

describe('changesOf', () => {
  it('lists only the fields that changed, by path', () => {
    expect(changesOf({ note: 'a', exempt: false, s: { x: 1 } }, { note: 'b', exempt: false, s: { x: 2, y: 3 } })).toEqual([
      { path: 'note', before: 'a', after: 'b' },
      { path: 's.x', before: 1, after: 2 },
      { path: 's.y', before: undefined, after: 3 },
    ]);
  });
});

describe('activity log', () => {
  it('describes events in plain words, counts levels and searches the sentences', () => {
    const { db } = openTestDb();
    db.insert(people).values({ ...base, plexUserId: 'p1', username: 'ann', displayName: 'Ann Lee', status: 'shared' }).run();
    audit(db, { actor: 'zed', action: 'digest.state', after: { mode: 'live' } });
    audit(db, { actor: 'zed', action: 'plex.remove', target: 'p1' });
    audit(db, { actor: 'playbill', action: 'job.failed', target: 'sync.history', after: { error: 'Tautulli timed out' } });
    const all = listActivity(db, { since: null });
    // Same millisecond, so compare as a set.
    expect(all.events.map((e) => e.title).sort()).toEqual(["Removed Ann Lee's access to the server", 'Switched the weekly digest to live', 'sync.history failed: Tautulli timed out']);
    expect(all.events.find((e) => e.action === 'plex.remove')).toMatchObject({ level: 'warning', category: 'people', targetHref: '/people/p1' });
    expect(activityCounts(db, { since: null })).toEqual({ all: 3, error: 1, warning: 1, info: 1 });
    expect(listActivity(db, { since: null, text: 'ann access' }).events).toHaveLength(1);
    expect(listActivity(db, { since: null, actor: 'playbill' }).events[0]?.actorLabel).toBe('Playbill');
  });

  it('shows a send with its deliveries', () => {
    const { db } = openTestDb();
    db.insert(campaigns).values({ id: 'c1', kind: 'digest', name: 'Digest', topic: 'digest', enabled: true, mode: 'live', cron: '0 19 * * 4', settings: {}, lastOccurrence: null, createdAt: 0, updatedAt: 0 }).run();
    db.insert(runs).values({ id: 'r1', campaignId: 'c1', windowKey: 'w', trigger: 'manual', status: 'done', content: {}, note: null, createdAt: 0, updatedAt: 0 }).run();
    db.insert(deliveries).values([
      { id: 'd1', runId: 'r1', plexUserId: null, email: 'a@x', name: 'A', status: 'sent', createdAt: 0 },
      { id: 'd2', runId: 'r1', plexUserId: null, email: 'b@x', name: 'B', status: 'failed', error: 'bounced', createdAt: 0 },
    ]).run();
    audit(db, { actor: 'playbill', action: 'campaign.sent', target: 'r1', after: { trigger: 'manual', sent: 1, failed: 1 } });
    const id = db.select().from(auditLog).get()!.id;
    const d = activityEvent(db, id)!;
    expect(d.event).toMatchObject({ title: 'Weekly digest sent to 1 person; 1 delivery failed', level: 'warning' });
    expect(d.run?.counts).toEqual({ sent: 1, failed: 1 });
    expect(d.run?.deliveries.map((x) => x.status)).toEqual(['sent', 'failed']);
  });
});

describe('pruneActivity', () => {
  it('drops events older than two years, and the oldest first while over the size limit', () => {
    const { db } = openTestDb();
    const now = Date.UTC(2028, 0, 1);
    const at = (daysAgo: number) => now - daysAgo * DAY;
    const rows = [800, 400, 300, 10].map((d, i) => ({ id: `a${i}`, at: at(d), actor: 'x', action: 'settings.general', target: null, before: null, after: { pad: 'x'.repeat(20_000) }, level: 'info' as const, category: 'settings' as const }));
    db.insert(auditLog).values(rows).run();
    pruneActivity(db, now);
    expect(db.select({ id: auditLog.id }).from(auditLog).all().map((r) => r.id)).toEqual(['a1', 'a2', 'a3']);
    // Over a size limit, the oldest goes first and the newest survives.
    const full = logBytes(db);
    const r = pruneActivity(db, now, { maxAgeMs: 730 * DAY, maxBytes: full - 15_000 });
    const left = db.select({ id: auditLog.id }).from(auditLog).all().map((x) => x.id);
    expect(left).not.toContain('a1');
    expect(left).toContain('a3');
    expect(r.bytes).toBeLessThanOrEqual(full - 15_000);
  });
});
