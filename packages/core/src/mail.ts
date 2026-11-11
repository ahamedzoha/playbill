import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { config } from './config';
import { crypto } from './crypto';
import type { Db } from './db';
import { getSetting, type SettingValue } from './settings';

export interface OutgoingEmail {
  to: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  /** Stable per delivery. Providers that support it never send the same key twice. */
  idempotencyKey: string;
}

/** The provider refused because a sending limit was reached: stop for now, try again later. */
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/** This address can never be delivered (rejected recipient, invalid address): don't retry. */
export class PermanentSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentSendError';
  }
}

export interface MailProvider {
  name: string;
  /** True when re-sending with the same idempotency key cannot cause a duplicate. */
  idempotent: boolean;
  send(email: OutgoingEmail): Promise<{ id: string }>;
}

function fromHeader(cfg: SettingValue<'email'>): string {
  const name = cfg.fromName.replace(/["\\]/g, '');
  return `"${name}" <${cfg.fromAddress}>`;
}

/** Resend's HTTP API. Idempotency keys make retries after a crash safe for 24 hours. */
export function resendProvider(cfg: SettingValue<'email'>, apiKey: string): MailProvider {
  return {
    name: 'resend',
    idempotent: true,
    async send(email) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': email.idempotencyKey,
        },
        body: JSON.stringify({
          from: fromHeader(cfg),
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          reply_to: cfg.replyTo ?? undefined,
          headers: email.headers,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (res.ok && body.id) return { id: body.id };
      const msg = `Resend ${res.status}: ${body.message ?? body.name ?? res.statusText}`;
      if (res.status === 429 && /quota/i.test(body.message ?? body.name ?? '')) throw new QuotaExceededError(msg);
      if (res.status === 422 || res.status === 403) throw new PermanentSendError(msg);
      throw new Error(msg);
    },
  };
}

/** Any SMTP server. No idempotency: a crash mid-send leaves the delivery as "unknown". */
export function smtpProvider(cfg: SettingValue<'email'>, password: string): MailProvider {
  if (!cfg.smtp) throw new Error('SMTP settings are missing');
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: password } : undefined,
    connectionTimeout: 20_000,
  });
  return {
    name: 'smtp',
    idempotent: false,
    async send(email) {
      try {
        const info = await transport.sendMail({
          from: fromHeader(cfg),
          to: { name: email.toName, address: email.to },
          replyTo: cfg.replyTo ?? undefined,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: email.headers,
          messageId: `<${email.idempotencyKey}@playbill>`,
        });
        return { id: info.messageId };
      } catch (err) {
        const e = err as { responseCode?: number; message?: string };
        if (e.responseCode && e.responseCode >= 550 && e.responseCode < 560) throw new PermanentSendError(e.message ?? 'Rejected');
        if (e.responseCode === 452 || e.responseCode === 421) throw new QuotaExceededError(e.message ?? 'Rate limited');
        throw err;
      }
    },
  };
}

/**
 * Writes emails to <config>/outbox instead of sending them. Used whenever PLAYBILL_MAIL_DRY_RUN=1,
 * so development and demo installs can never reach real people.
 */
export function dryRunProvider(): MailProvider {
  const dir = join(config().configDir, 'outbox');
  return {
    name: 'dry-run',
    idempotent: true,
    async send(email) {
      mkdirSync(dir, { recursive: true });
      const base = `${new Date().toISOString().replace(/[:.]/g, '-')}-${email.to.replace(/[^a-z0-9@._-]/gi, '_')}`;
      writeFileSync(join(dir, `${base}.html`), email.html);
      writeFileSync(join(dir, `${base}.json`), JSON.stringify({ ...email, html: undefined }, null, 2));
      return { id: `dry_${email.idempotencyKey}` };
    },
  };
}

export function isDryRun(): boolean {
  return process.env.PLAYBILL_MAIL_DRY_RUN === '1' || config().demoMode;
}

/** The configured provider, the dry-run outbox in development, or null when email isn't set up. */
export function mailer(db: Db): MailProvider | null {
  if (isDryRun()) return dryRunProvider();
  const cfg = getSetting(db, 'email');
  if (!cfg) return null;
  const secret = crypto().decrypt(cfg.secretEnc);
  return cfg.provider === 'resend' ? resendProvider(cfg, secret) : smtpProvider(cfg, secret);
}
