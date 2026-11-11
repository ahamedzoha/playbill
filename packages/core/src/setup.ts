import { randomInt } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { hasOwner } from './auth';
import { config } from './config';
import type { Db } from './db';
import { settings } from './db/schema';
import { safeEqual } from './ids';
import { getSetting, setSetting, setupState } from './settings';

/** Wizard steps that exist so far. Later phases add email, branding, users and webhooks. */
export const SETUP_STEPS = ['code', 'plex-sign-in', 'server', 'tautulli'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

// No 0/O/1/I/L: the code is read from a terminal and typed by hand.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Normalises user input: case-insensitive, dash and spaces optional. */
function canonical(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Returns the setup code while the instance has no owner, creating it on first call and writing it
 * to `<config>/setup-code.txt`. Returns null once an owner exists.
 */
export function ensureSetupCode(db: Db): string | null {
  if (hasOwner(db)) {
    clearSetupCode(db);
    return null;
  }
  let code = getSetting(db, 'setupCode')?.code;
  if (!code) {
    code = makeCode();
    setSetting(db, 'setupCode', { code });
  }
  try {
    writeFileSync(join(config().configDir, 'setup-code.txt'), `${code}\n`, { mode: 0o600 });
  } catch {
    // Not fatal: the code is also printed in the logs.
  }
  return code;
}

/** Once an owner exists the code has done its job: forget it and remove the file. */
export function clearSetupCode(db: Db): void {
  db.delete(settings).where(eq(settings.key, 'setupCode')).run();
  rmSync(join(config().configDir, 'setup-code.txt'), { force: true });
}

export function checkSetupCode(db: Db, input: string): boolean {
  const code = getSetting(db, 'setupCode')?.code;
  return !!code && safeEqual(canonical(code), canonical(input));
}

export function isSetupComplete(db: Db): boolean {
  return setupState(db).completedAt !== null;
}

export function advanceSetup(db: Db, step: number, complete = false): void {
  const current = setupState(db);
  setSetting(db, 'setup', {
    step: Math.max(current.step, step),
    completedAt: complete ? (current.completedAt ?? Date.now()) : current.completedAt,
  });
}
