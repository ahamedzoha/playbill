import { categoryOf, levelOf } from './activity-classify';
import type { Db } from './db';
import { auditLog } from './db/schema';
import { newId } from './ids';

/** Records one activity event: who did what to what, with before/after where it helps. */
export function audit(
  db: Db,
  entry: { actor: string; action: string; target?: string; before?: unknown; after?: unknown },
): void {
  db.insert(auditLog)
    .values({
      id: newId('aud'),
      at: Date.now(),
      actor: entry.actor,
      action: entry.action,
      target: entry.target ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      level: levelOf(entry.action, entry.after),
      category: categoryOf(entry.action),
    })
    .run();
}
