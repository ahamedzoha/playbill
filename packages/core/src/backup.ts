import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Sqlite } from './db';

export const BACKUP_PREFIX = 'playbill-';

/**
 * Online backup with SQLite's backup API: consistent even while the web process is writing.
 * Writes `<dir>/playbill-<label>.db` and returns its path.
 */
export async function backupDatabase(sqlite: Sqlite, dir: string, label: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${BACKUP_PREFIX}${label}.db`);
  rmSync(file, { force: true });
  await sqlite.backup(file);
  return file;
}

/** Keeps the newest `keep` dated backups (playbill-YYYYMMDD.db). Pre-migration copies are left alone. */
export function pruneBackups(dir: string, keep: number): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const dated = names
    .filter((n) => /^playbill-\d{8}\.db$/.test(n))
    .sort()
    .reverse();
  const removed = dated.slice(keep);
  for (const n of removed) rmSync(join(dir, n), { force: true });
  return removed;
}

export function newestBackupAge(dir: string, now = Date.now()): number | null {
  try {
    const dated = readdirSync(dir).filter((n) => /^playbill-\d{8}\.db$/.test(n));
    if (dated.length === 0) return null;
    return Math.min(...dated.map((n) => now - statSync(join(dir, n)).mtimeMs));
  } catch {
    return null;
  }
}

export function dateLabel(d = new Date()): string {
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}
