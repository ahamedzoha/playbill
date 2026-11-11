import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db, Sqlite } from './index';
import * as schema from './schema';

/**
 * Worker and tests only — the web bundle must not import this module.
 *
 * Migrations ship next to the code. The worker bundle sets PLAYBILL_MIGRATIONS_DIR to its copy;
 * from source they are read from packages/core/drizzle.
 */
export function migrationsDir(): string {
  if (process.env.PLAYBILL_MIGRATIONS_DIR) return process.env.PLAYBILL_MIGRATIONS_DIR;
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');
}

/** Migrations not yet applied, by tag. Used to take a backup before migrating. */
export function pendingMigrations(sqlite: Sqlite, dir = migrationsDir()): string[] {
  const journal = join(dir, 'meta', '_journal.json');
  if (!existsSync(journal)) return [];
  const entries = (JSON.parse(readFileSync(journal, 'utf8')) as { entries: { tag: string; when: number }[] }).entries;
  const hasTable = sqlite
    .prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
    .get();
  if (!hasTable) return entries.map((e) => e.tag);
  const applied = new Set(
    (sqlite.prepare('select created_at from __drizzle_migrations').all() as { created_at: number }[]).map((r) =>
      Number(r.created_at),
    ),
  );
  return entries.filter((e) => !applied.has(e.when)).map((e) => e.tag);
}

export function runMigrations(sqlite: Sqlite, dir = migrationsDir()): void {
  if (!existsSync(dir) || readdirSync(dir).length === 0) throw new Error(`No migrations found in ${dir}`);
  migrate(drizzle(sqlite, { schema }), { migrationsFolder: dir });
}

/** For tests: an isolated, migrated in-memory database. */
export function openTestDb(): { sqlite: Sqlite; db: Db } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
