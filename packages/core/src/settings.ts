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
    publicUrl: z.string().url().nullable(),
    timezone: z.string(),
    serverName: z.string(),
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
