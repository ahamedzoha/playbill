import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './db';
import { settings } from './db/schema';
import { randomToken } from './ids';

/** Every setting has a schema, so a hand-edited or old value can't crash the app. */
export const settingSchemas = {
  /** Identifies this install to plex.tv (X-Plex-Client-Identifier). Generated once. */
  instance: z.object({ clientId: z.string().min(8) }),
  /** The Plex account that owns the server. Its token reads the server and manages shares. */
  owner: z.object({
    plexUserId: z.string(),
    username: z.string(),
    /** AES-GCM ciphertext of the plex.tv token. */
    tokenEnc: z.string(),
  }),
  /** The Plex Media Server chosen in setup. */
  plex: z.object({
    machineId: z.string(),
    name: z.string(),
    /** The connection URL Playbill uses to reach Plex Media Server. */
    url: z.string().url(),
  }),
  setup: z.object({
    /** Highest wizard step finished. */
    step: z.number().int().min(0),
    completedAt: z.number().nullable(),
  }),
  /**
   * One-time code that proves the person running the wizard can read the container logs.
   * Without it, anyone who reaches a fresh install first could sign in with Plex and claim it.
   */
  setupCode: z.object({ code: z.string().min(8) }),
  general: z.object({
    /** Where people reach Playbill from outside, e.g. https://playbill.example.com. Emails link and load images from it. */
    publicUrl: z.string().url().nullable(),
    timezone: z.string(),
    serverName: z.string(),
  }),
  /** How Playbill sends email. The secret (API key or SMTP password) is AES-GCM ciphertext. */
  email: z.object({
    provider: z.enum(['resend', 'smtp']),
    fromName: z.string().min(1),
    fromAddress: z.string().email(),
    replyTo: z.string().email().nullable(),
    smtp: z
      .object({ host: z.string().min(1), port: z.number().int(), secure: z.boolean(), user: z.string().nullable() })
      .nullable(),
    secretEnc: z.string(),
    /** Playbill's own sending limits; leave room for other apps on the same account. */
    limits: z.object({ perDay: z.number().int().min(1), perMonth: z.number().int().min(1) }),
  }),
  /** Inactive-user housekeeping. Nudges and warnings send automatically when enabled; removals always wait for approval. */
  lifecycle: z.object({
    enabled: z.boolean(),
    nudgeDays: z.number().int().min(14),
    warnDays: z.number().int().min(30),
    removeDays: z.number().int().min(60),
    /** Days between the warning and when removal is proposed. */
    graceDays: z.number().int().min(3),
    sendGoodbye: z.boolean(),
  }),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;

export function getSetting<K extends SettingKey>(db: Db, key: K): SettingValue<K> | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return null;
  const parsed = settingSchemas[key].safeParse(row.value);
  return parsed.success ? (parsed.data as SettingValue<K>) : null;
}

export function setSetting<K extends SettingKey>(db: Db, key: K, value: SettingValue<K>): void {
  const valid = settingSchemas[key].parse(value);
  const now = Date.now();
  db.insert(settings)
    .values({ key, value: valid, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: valid, updatedAt: now } })
    .run();
}

export function instanceClientId(db: Db): string {
  const existing = getSetting(db, 'instance');
  if (existing) return existing.clientId;
  const clientId = `playbill-${randomToken(12)}`;
  setSetting(db, 'instance', { clientId });
  return getSetting(db, 'instance')!.clientId;
}

export function setupState(db: Db): SettingValue<'setup'> {
  return getSetting(db, 'setup') ?? { step: 0, completedAt: null };
}
