'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@playbill/core/audit';
import { crypto } from '@playbill/core/crypto';
import { deleteIntegration, saveIntegration, testIntegration } from '@playbill/core/integrations';
import { mailer } from '@playbill/core/mail';
import { getSetting, setSetting } from '@playbill/core/settings';
import { currentOwner, db } from '@/lib/server';

export interface FormState {
  ok: boolean;
  message: string;
}

const fail = (message: string): FormState => ({ ok: false, message });

async function owner() {
  const o = await currentOwner();
  if (!o) throw new Error('Only the server owner can change settings.');
  return o;
}

function wrap(fn: () => Promise<FormState>): Promise<FormState> {
  return fn().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
}

export async function saveGeneral(_p: FormState | null, form: FormData): Promise<FormState> {
  return wrap(async () => {
    const o = await owner();
    const publicUrl = String(form.get('publicUrl') ?? '').trim().replace(/\/+$/, '');
    const timezone = String(form.get('timezone') ?? '').trim();
    if (publicUrl && !/^https?:\/\/[^\s/]+/.test(publicUrl)) return fail('The public address must start with https:// (or http://).');
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      return fail(`"${timezone}" isn't a timezone. Use a name like Europe/London or Asia/Dhaka.`);
    }
    const d = db();
    const before = getSetting(d, 'general');
    const after = { publicUrl: publicUrl || null, timezone, serverName: before?.serverName ?? getSetting(d, 'plex')?.name ?? 'Plex' };
    setSetting(d, 'general', after);
    audit(d, { actor: o.username, action: 'settings.general', before, after });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Saved' };
  });
}

const emailForm = z.object({
  provider: z.enum(['resend', 'smtp']),
  fromName: z.string().trim().min(1, 'Add a sender name.'),
  fromAddress: z.string().trim().email('The from address isn’t a valid email address.'),
  replyTo: z.string().trim().email('The reply-to address isn’t valid.').or(z.literal('')),
  secret: z.string(),
  host: z.string().trim(),
  port: z.coerce.number().int().min(1).max(65535).or(z.nan()),
  secure: z.boolean(),
  user: z.string().trim(),
  perDay: z.coerce.number().int().min(1),
  perMonth: z.coerce.number().int().min(1),
});

export async function saveEmail(_p: FormState | null, form: FormData): Promise<FormState> {
  return wrap(async () => {
    const o = await owner();
    const parsed = emailForm.safeParse({
      provider: form.get('provider'),
      fromName: form.get('fromName'),
      fromAddress: form.get('fromAddress'),
      replyTo: form.get('replyTo') ?? '',
      secret: form.get('secret') ?? '',
      host: form.get('host') ?? '',
      port: form.get('port') ?? NaN,
      secure: form.get('secure') === 'on',
      user: form.get('user') ?? '',
      perDay: form.get('perDay'),
      perMonth: form.get('perMonth'),
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the form.');
    const v = parsed.data;
    const d = db();
    const prev = getSetting(d, 'email');
    const secretEnc = v.secret ? crypto().encrypt(v.secret) : prev?.secretEnc;
    if (!secretEnc) return fail(v.provider === 'resend' ? 'Paste your Resend API key.' : 'Enter the SMTP password.');
    if (v.provider === 'smtp' && (!v.host || Number.isNaN(v.port))) return fail('Enter the SMTP server and port.');
    setSetting(d, 'email', {
      provider: v.provider,
      fromName: v.fromName,
      fromAddress: v.fromAddress,
      replyTo: v.replyTo || null,
      smtp: v.provider === 'smtp' ? { host: v.host, port: v.port, secure: v.secure, user: v.user || null } : null,
      secretEnc,
      limits: { perDay: v.perDay, perMonth: v.perMonth },
    });
    audit(d, { actor: o.username, action: 'settings.email', after: { provider: v.provider, fromAddress: v.fromAddress, limits: { perDay: v.perDay, perMonth: v.perMonth } } });
    revalidatePath('/settings');
    revalidatePath('/newsletters');
    return { ok: true, message: 'Saved. Send yourself a test email to check it works.' };
  });
}

/** A one-off plain email to the owner, to prove the provider settings work. Not counted as a newsletter. */
export async function sendTestEmail(): Promise<FormState> {
  return wrap(async () => {
    const o = await owner();
    if (!o.email) return fail("Your Plex account has no email address Playbill can see.");
    const m = mailer(db());
    if (!m) return fail('Save the email settings first.');
    const server = getSetting(db(), 'plex')?.name ?? 'Plex';
    await m.send({
      to: o.email,
      toName: o.username,
      subject: `Playbill test from ${server}`,
      html: `<p>This is a test from Playbill on ${server}. If you can read it, email works.</p>`,
      text: `This is a test from Playbill on ${server}. If you can read it, email works.`,
      headers: {},
      idempotencyKey: `test-${Date.now()}`,
    });
    return { ok: true, message: `Sent to ${o.email}${m.name === 'dry-run' ? ' (dry run: written to the outbox)' : ''}.` };
  });
}

const integrationForm = z.object({
  kind: z.enum(['seerr', 'sonarr', 'radarr']),
  name: z.string().trim().max(60),
  baseUrl: z.string().trim().url('Enter the full address, e.g. http://192.168.1.10:8989'),
  apiKey: z.string().trim().min(8, 'Paste the API key.'),
});

export async function addIntegration(_p: FormState | null, form: FormData): Promise<FormState> {
  return wrap(async () => {
    const o = await owner();
    const parsed = integrationForm.safeParse({
      kind: form.get('kind'),
      name: form.get('name') ?? '',
      baseUrl: form.get('baseUrl'),
      apiKey: form.get('apiKey'),
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the form.');
    const v = parsed.data;
    let message: string;
    try {
      message = await testIntegration(v.kind, v.baseUrl, v.apiKey);
    } catch (err) {
      return fail(`Couldn't connect: ${err instanceof Error ? err.message : String(err)}`);
    }
    const label = v.name || { seerr: 'Seerr', sonarr: 'Sonarr', radarr: 'Radarr' }[v.kind];
    saveIntegration(db(), { kind: v.kind, name: label, baseUrl: v.baseUrl, apiKey: v.apiKey }, { ok: true, message });
    audit(db(), { actor: o.username, action: 'settings.integration.add', after: { kind: v.kind, baseUrl: v.baseUrl } });
    revalidatePath('/settings');
    return { ok: true, message: `Connected: ${message}` };
  });
}

export async function removeIntegration(id: string): Promise<FormState> {
  return wrap(async () => {
    const o = await owner();
    deleteIntegration(db(), id);
    audit(db(), { actor: o.username, action: 'settings.integration.remove', target: id });
    revalidatePath('/settings');
    return { ok: true, message: 'Removed' };
  });
}

