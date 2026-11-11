import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

process.env.CONFIG_DIR = mkdtempSync(join(tmpdir(), 'playbill-cmp-'));

const { advanceRun, createRun, digestAudience, ensureDigestCampaign } = await import('./campaigns');
const { openTestDb } = await import('./db/migrate');
const { campaigns, deliveries, people } = await import('./db/schema');
const { QuotaExceededError } = await import('./mail');
const { setSetting } = await import('./settings');
const { setPreference, suppress } = await import('./topics');

const sources = { tautulli: null, seerr: null, sonarrs: [], radarrs: [] };

function setup(n = 3) {
  const { db } = openTestDb();
  const base = { thumb: null, plexLastSeenAt: null, tautulliNotify: null, removedAt: null, syncedAt: 0, invitedAt: 0, acceptedAt: 0, lastPlayedAt: null, firstSeenAt: 0 };
  db.insert(people)
    .values(
      Array.from({ length: n }, (_, i) => ({
        ...base,
        plexUserId: String(i + 1),
        username: `u${i + 1}`,
        displayName: `User ${i + 1}`,
        email: `u${i + 1}@example.com`,
        status: 'shared' as const,
      })),
    )
    .run();
  setSetting(db, 'email', {
    provider: 'resend',
    fromName: 'Test',
    fromAddress: 'from@example.com',
    replyTo: null,
    smtp: null,
    secretEnc: 'x',
    limits: { perDay: 100, perMonth: 1000 },
  });
  const c = ensureDigestCampaign(db);
  db.update(campaigns).set({ mode: 'live', settings: { ...(c.settings as object), skipIfEmpty: false, testAddresses: ['me@example.com'] } }).run();
  return { db, campaign: db.select().from(campaigns).get()! };
}

function fakeMailer(opts: { idempotent?: boolean; failOn?: (to: string, n: number) => Error | null } = {}) {
  const sent: string[] = [];
  let n = 0;
  return {
    sent,
    mailer: {
      name: 'fake',
      idempotent: opts.idempotent ?? true,
      async send(e: { to: string }) {
        n++;
        const err = opts.failOn?.(e.to, n);
        if (err) throw err;
        sent.push(e.to);
        return { id: `id-${n}` };
      },
    },
  };
}

const render = async (_c: unknown, r: { email: string; name: string }, id: string) => ({
  to: r.email,
  toName: r.name,
  subject: 's',
  html: 'h',
  text: 't',
  headers: {},
  idempotencyKey: id,
});

describe('advanceRun', () => {
  it('sends one email per audience member and finishes', async () => {
    const { db, campaign } = setup(3);
    const run = createRun(db, campaign, 'schedule', 'w1')!;
    const m = fakeMailer();
    const r = await advanceRun(db, run.id, { sources, mailer: m.mailer, render });
    expect(r).toMatchObject({ status: 'done', sent: 3 });
    expect(m.sent.sort()).toEqual(['u1@example.com', 'u2@example.com', 'u3@example.com']);
    // Running it again sends nothing more.
    expect((await advanceRun(db, run.id, { sources, mailer: m.mailer, render })).sent).toBe(0);
    expect(m.sent).toHaveLength(3);
  });

  it('one run per occurrence', () => {
    const { db, campaign } = setup(1);
    expect(createRun(db, campaign, 'schedule', 'w1')).not.toBeNull();
    expect(createRun(db, campaign, 'schedule', 'w1')).toBeNull();
  });

  it('test mode sends only to the test addresses', async () => {
    const { db, campaign } = setup(3);
    db.update(campaigns).set({ mode: 'test' }).run();
    const run = createRun(db, campaign, 'schedule', 'w1')!;
    const m = fakeMailer();
    await advanceRun(db, run.id, { sources, mailer: m.mailer, render });
    expect(m.sent).toEqual(['me@example.com']);
  });

  it('skips opted-out and suppressed people', () => {
    const { db } = setup(3);
    setPreference(db, '1', 'digest', false, 'recipient');
    suppress(db, 'U2@example.com', 'bounced');
    const a = digestAudience(db, 'digest');
    expect(a.recipients.map((r) => r.email)).toEqual(['u3@example.com']);
    expect(a).toMatchObject({ optedOut: 1, suppressed: 1 });
  });

  it('defers the whole run instead of sending part of it when the allowance is short', async () => {
    const { db, campaign } = setup(3);
    setSetting(db, 'email', {
      provider: 'resend',
      fromName: 'Test',
      fromAddress: 'from@example.com',
      replyTo: null,
      smtp: null,
      secretEnc: 'x',
      limits: { perDay: 2, perMonth: 1000 },
    });
    const run = createRun(db, campaign, 'schedule', 'w1')!;
    const m = fakeMailer();
    const r = await advanceRun(db, run.id, { sources, mailer: m.mailer, render });
    expect(r.status).toBe('deferred');
    expect(m.sent).toHaveLength(0);
  });

  it('stops cleanly when the provider reports its quota is used up, and resumes later', async () => {
    const { db, campaign } = setup(3);
    const run = createRun(db, campaign, 'schedule', 'w1')!;
    const first = fakeMailer({ failOn: (_to, n) => (n === 2 ? new QuotaExceededError('daily quota') : null) });
    const r1 = await advanceRun(db, run.id, { sources, mailer: first.mailer, render });
    expect(r1.status).toBe('deferred');
    expect(first.sent).toHaveLength(1);
    const second = fakeMailer();
    const r2 = await advanceRun(db, run.id, { sources, mailer: second.mailer, render });
    expect(r2.status).toBe('done');
    expect([...first.sent, ...second.sent].sort()).toEqual(['u1@example.com', 'u2@example.com', 'u3@example.com']);
  });

  it('after a crash mid-send: retries with an idempotent provider, marks unknown otherwise', async () => {
    for (const idempotent of [true, false]) {
      const { db, campaign } = setup(2);
      const run = createRun(db, campaign, 'schedule', 'w1')!;
      // Get it to "sending" with no deliveries sent, then simulate a crash on the first one.
      const crash = fakeMailer({ failOn: () => null });
      await advanceRun(db, run.id, { sources, mailer: crash.mailer, render, keepGoing: () => false });
      const d = db.select().from(deliveries).all()[0]!;
      db.update(deliveries).set({ status: 'sending' }).where(eq(deliveries.id, d.id)).run();
      const m = fakeMailer({ idempotent });
      await advanceRun(db, run.id, { sources, mailer: m.mailer, render });
      const after = db.select().from(deliveries).where(eq(deliveries.id, d.id)).get()!;
      expect(after.status).toBe(idempotent ? 'sent' : 'unknown');
    }
  });

  it('defers when email is not set up', async () => {
    const { db, campaign } = setup(1);
    const run = createRun(db, campaign, 'schedule', 'w1')!;
    const r = await advanceRun(db, run.id, { sources, mailer: null, render });
    expect(r.status).toBe('deferred');
  });
});
