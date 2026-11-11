import { and, eq } from 'drizzle-orm';
import { TautulliClient } from './clients/tautulli';
import { normalizeBaseUrl } from './clients/http';
import { crypto } from './crypto';
import type { Db } from './db';
import { integrations } from './db/schema';
import { newId } from './ids';

export type IntegrationKind = (typeof integrations.$inferSelect)['kind'];

export interface IntegrationSecret {
  apiKey: string;
}

export interface IntegrationView {
  id: string;
  kind: IntegrationKind;
  name: string;
  baseUrl: string;
  enabled: boolean;
  lastCheckAt: number | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
}

function toView(row: typeof integrations.$inferSelect): IntegrationView {
  const { secret: _secret, createdAt: _c, updatedAt: _u, ...view } = row;
  return view;
}

export function listIntegrations(db: Db, kind?: IntegrationKind): IntegrationView[] {
  const rows = kind
    ? db.select().from(integrations).where(eq(integrations.kind, kind)).all()
    : db.select().from(integrations).all();
  return rows.map(toView);
}

/** Single-instance kinds (Tautulli, Seerr) are replaced; Sonarr/Radarr may have several. */
export function saveIntegration(
  db: Db,
  input: { id?: string; kind: IntegrationKind; name: string; baseUrl: string; apiKey: string },
  check: { ok: boolean; message: string },
): string {
  const now = Date.now();
  const secret = crypto().encrypt(JSON.stringify({ apiKey: input.apiKey } satisfies IntegrationSecret));
  const single = input.kind === 'tautulli' || input.kind === 'seerr';
  const existing = input.id
    ? db.select().from(integrations).where(eq(integrations.id, input.id)).get()
    : single
      ? db.select().from(integrations).where(eq(integrations.kind, input.kind)).get()
      : undefined;
  const values = {
    kind: input.kind,
    name: input.name,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    secret,
    enabled: true,
    lastCheckAt: now,
    lastCheckOk: check.ok,
    lastCheckMessage: check.message,
    updatedAt: now,
  };
  if (existing) {
    db.update(integrations).set(values).where(eq(integrations.id, existing.id)).run();
    return existing.id;
  }
  const id = newId('int');
  db.insert(integrations)
    .values({ id, ...values, createdAt: now })
    .run();
  return id;
}

export function integrationSecret(db: Db, id: string): IntegrationSecret | null {
  const row = db.select().from(integrations).where(eq(integrations.id, id)).get();
  return row ? (JSON.parse(crypto().decrypt(row.secret)) as IntegrationSecret) : null;
}

export function tautulli(db: Db): TautulliClient | null {
  const row = db
    .select()
    .from(integrations)
    .where(and(eq(integrations.kind, 'tautulli'), eq(integrations.enabled, true)))
    .get();
  if (!row) return null;
  const { apiKey } = JSON.parse(crypto().decrypt(row.secret)) as IntegrationSecret;
  return new TautulliClient(row.baseUrl, apiKey);
}
