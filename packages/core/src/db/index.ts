import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { config } from '../config';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;
export type Sqlite = Database.Database;
export { schema };

export function openSqlite(path: string): Sqlite {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  // FULL, not NORMAL: home servers lose power. A send marked "sent" must survive a power cut,
  // or the next start would deliver it twice.
  sqlite.pragma('synchronous = FULL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 10000');
  return sqlite;
}

const globalForDb = globalThis as unknown as { __playbillDb?: { sqlite: Sqlite; db: Db } };

/**
 * The process-wide connection. Only the worker runs migrations (see ./migrate, before anything
 * else starts); the web process just opens the file.
 */
export function getDb(): Db {
  if (!globalForDb.__playbillDb) {
    const sqlite = openSqlite(config().dbPath);
    globalForDb.__playbillDb = { sqlite, db: drizzle(sqlite, { schema }) };
  }
  return globalForDb.__playbillDb.db;
}

export function getSqlite(): Sqlite {
  getDb();
  return globalForDb.__playbillDb!.sqlite;
}
