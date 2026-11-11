'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { audit } from '@playbill/core/audit';
import { createRun, digestSettings, ensureDigestCampaign } from '@playbill/core/campaigns';
import { campaigns } from '@playbill/core/db/schema';
import { Queue } from '@playbill/core/queue';
import { currentOwner, db } from '@/lib/server';

export interface FormState {
  ok: boolean;
  message: string;
}

const DAYS = [0, 1, 2, 3, 4, 5, 6];

async function owner() {
  const o = await currentOwner();
  if (!o) throw new Error('Only the server owner can change newsletters.');
  return o;
}

export async function saveDigest(_prev: FormState | null, form: FormData): Promise<FormState> {
  try {
    const o = await owner();
    const d = db();
    const c = ensureDigestCampaign(d);
    const day = Number(form.get('day'));
    const [hh, mm] = String(form.get('time') ?? '19:00').split(':').map(Number);
    if (!DAYS.includes(day) || !Number.isInteger(hh) || !Number.isInteger(mm) || hh! < 0 || hh! > 23 || mm! < 0 || mm! > 59) {
      return { ok: false, message: 'Choose a day and a time.' };
    }
    const parsed = digestSettings.safeParse({
      subject: String(form.get('subject') ?? '').trim(),
      intro: String(form.get('intro') ?? ''),
      signature: String(form.get('signature') ?? '').trim(),
      sections: {
        added: form.get('added') === 'on',
        coming: form.get('coming') === 'on',
        requests: form.get('requests') === 'on',
        stats: form.get('stats') === 'on',
      },
      maxItems: Number(form.get('maxItems') ?? 12),
      testAddresses: String(form.get('testAddresses') ?? '')
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      skipIfEmpty: form.get('skipIfEmpty') === 'on',
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, message: issue?.path[0] === 'testAddresses' ? 'Test addresses must be valid email addresses.' : 'Check the subject and sign-off; neither can be empty.' };
    }
    const cron = `${mm} ${hh} * * ${day}`;
    d.update(campaigns).set({ settings: parsed.data, cron, updatedAt: Date.now() }).where(eq(campaigns.id, c.id)).run();
    audit(d, { actor: o.username, action: 'digest.settings', target: c.id, before: { settings: c.settings, cron: c.cron }, after: { settings: parsed.data, cron } });
    revalidatePath('/newsletters');
    return { ok: true, message: 'Saved' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function setDigestState(input: { enabled?: boolean; mode?: 'test' | 'live' }): Promise<FormState> {
  try {
    const o = await owner();
    const d = db();
    const c = ensureDigestCampaign(d);
    const patch = { ...input, updatedAt: Date.now(), ...(input.enabled ? { lastOccurrence: Date.now() } : {}) };
    d.update(campaigns).set(patch).where(eq(campaigns.id, c.id)).run();
    audit(d, { actor: o.username, action: 'digest.state', target: c.id, before: { enabled: c.enabled, mode: c.mode }, after: input });
    revalidatePath('/newsletters');
    return { ok: true, message: 'Saved' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Builds this week's digest now and sends it, to the test addresses only or (live) to everyone. */
export async function sendDigestNow(kind: 'test' | 'live'): Promise<FormState> {
  try {
    const o = await owner();
    const d = db();
    const c = ensureDigestCampaign(d);
    if (kind === 'live' && c.mode !== 'live') return { ok: false, message: 'Switch the digest to Live first.' };
    const run = createRun(d, c, kind === 'test' ? 'test' : 'manual', `${kind}:${Date.now()}`);
    if (!run) return { ok: false, message: 'Something else is sending right now. Try again in a minute.' };
    new Queue(d).enqueue('campaign.run', { runId: run.id }, { dedupeKey: `run:${run.id}` });
    audit(d, { actor: o.username, action: `digest.send.${kind}`, target: run.id });
    revalidatePath('/newsletters');
    return { ok: true, message: kind === 'test' ? 'Test on its way. It usually arrives within a minute.' : 'Sending now.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------------------------
// New arrivals

import { arrivalsSettings, ensureArrivalsCampaign, planTestArrivals } from '@playbill/core/arrivals';

export async function setArrivalsState(input: { enabled?: boolean; mode?: 'test' | 'live' }): Promise<FormState> {
  try {
    const o = await owner();
    const d = db();
    const c = ensureArrivalsCampaign(d);
    d.update(campaigns).set({ ...input, updatedAt: Date.now() }).where(eq(campaigns.id, c.id)).run();
    audit(d, { actor: o.username, action: 'arrivals.state', target: c.id, before: { enabled: c.enabled, mode: c.mode }, after: input });
    revalidatePath('/newsletters');
    return { ok: true, message: 'Saved' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function saveArrivals(_prev: FormState | null, form: FormData): Promise<FormState> {
  try {
    const o = await owner();
    const d = db();
    const c = ensureArrivalsCampaign(d);
    const cur = arrivalsSettings.parse(c.settings);
    const parsed = arrivalsSettings.safeParse({
      ...cur,
      debounceMinutes: Number(form.get('debounceHours') ?? 2) * 60,
      maxWaitHours: Number(form.get('maxWaitHours') ?? 24),
      quietStart: Number(form.get('quietStart') ?? 22),
      quietEnd: Number(form.get('quietEnd') ?? 9),
      testAddresses: String(form.get('testAddresses') ?? '')
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    });
    if (!parsed.success) return { ok: false, message: 'Check the numbers and the test addresses.' };
    d.update(campaigns).set({ settings: parsed.data, updatedAt: Date.now() }).where(eq(campaigns.id, c.id)).run();
    audit(d, { actor: o.username, action: 'arrivals.settings', target: c.id, before: cur, after: parsed.data });
    revalidatePath('/newsletters');
    return { ok: true, message: 'Saved' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendArrivalsTest(): Promise<FormState> {
  try {
    const o = await owner();
    const d = db();
    const plan = planTestArrivals(d, ensureArrivalsCampaign(d));
    if (!plan) return { ok: false, message: 'Nothing arrived in the past week to put in a test, or there are no test addresses.' };
    new Queue(d).enqueue('campaign.run', { runId: plan.runId }, { dedupeKey: `run:${plan.runId}` });
    audit(d, { actor: o.username, action: 'arrivals.send.test', target: plan.runId });
    revalidatePath('/newsletters');
    return { ok: true, message: `Test with ${plan.items} ${plan.items === 1 ? 'title' : 'titles'} on its way.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------------------------
// Monthly recap

import { ensureRecapCampaign } from '@playbill/core/recap';

export async function setRecapState(input: { enabled?: boolean; mode?: 'test' | 'live' }): Promise<FormState> {
  try {
    const o = await owner();
    const d = db();
    const c = ensureRecapCampaign(d);
    d.update(campaigns).set({ ...input, updatedAt: Date.now() }).where(eq(campaigns.id, c.id)).run();
    audit(d, { actor: o.username, action: 'recap.state', target: c.id, before: { enabled: c.enabled, mode: c.mode }, after: input });
    revalidatePath('/newsletters');
    return { ok: true, message: 'Saved' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendRecapTest(): Promise<FormState> {
  try {
    const o = await owner();
    const d = db();
    const c = ensureRecapCampaign(d);
    const run = createRun(d, c, 'test', `test:${Date.now()}`);
    if (!run) return { ok: false, message: 'Try again in a moment.' };
    new Queue(d).enqueue('campaign.run', { runId: run.id }, { dedupeKey: `run:${run.id}` });
    audit(d, { actor: o.username, action: 'recap.send.test', target: run.id });
    revalidatePath('/newsletters');
    return { ok: true, message: "Test on its way: last month's recap, yours if you watched, otherwise a sample." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
