import 'server-only';
import { eq } from 'drizzle-orm';
import { arrivalsSettings, ensureArrivalsCampaign } from '@playbill/core/arrivals';
import { campaignSettings, ensureDigestCampaign } from '@playbill/core/campaigns';
import { people } from '@playbill/core/db/schema';
import { buildDigest } from '@playbill/core/digest';
import { radarrs, seerr, sonarrs, tautulli } from '@playbill/core/integrations';
import { ensureLeavingCampaign } from '@playbill/core/library';
import { ensureLifecycleCampaign } from '@playbill/core/lifecycle';
import { type PreviewKind, previewArrivals, previewLeaving, previewLifecycle, previewRecap } from '@playbill/core/preview';
import { ensureRecapCampaign } from '@playbill/core/recap';
import { getSetting } from '@playbill/core/settings';
import { renderArrivalsEmail, renderDigestEmail, renderLeavingEmail, renderLifecycleEmail, renderRecapEmail } from '@playbill/emails';
import { digestContext } from './digest';
import { db, timezone } from './server';

export type RenderedPreview = { html: string; subject: string; to: string | null; note: string | null } | { empty: string };

const signatureOf = (settings: unknown, fallback: string) => String((settings as { signature?: string } | null)?.signature ?? fallback);

/**
 * Any Playbill email as one person would get it, rendered with the same context the worker sends
 * with. Nothing is saved or sent: previews call the content builders directly, never the run queue.
 */
export async function renderPreview(kind: PreviewKind, personId: string | null, origin: string): Promise<RenderedPreview> {
  const d = db();
  const p = personId ? (d.select().from(people).where(eq(people.plexUserId, personId)).get() ?? null) : null;
  const now = Date.now();
  const publicUrl = getSetting(d, 'general')?.publicUrl ?? origin;
  const serverName = getSetting(d, 'plex')?.name ?? 'Plex';
  const tz = timezone();
  const r = (person: typeof p) => ({ plexUserId: person?.plexUserId ?? null, email: person?.email ?? 'preview@example.com', name: person?.displayName ?? 'there' });

  if (kind === 'digest') {
    const c = ensureDigestCampaign(d);
    const s = campaignSettings(c);
    const content = await buildDigest(d, { tautulli: tautulli(d), seerr: seerr(d), sonarrs: sonarrs(d), radarrs: radarrs(d) }, s, now - 7 * 86_400_000, now);
    const m = await renderDigestEmail(content, digestContext(c, origin), r(p), 'preview');
    return { html: m.html, subject: m.subject, to: p?.email ?? null, note: null };
  }

  if (kind === 'arrivals') {
    const c = ensureArrivalsCampaign(d);
    const s = arrivalsSettings.parse(c.settings);
    const pv = previewArrivals(d, p, s.followDays, now);
    if (!pv) return { empty: "Nothing has arrived since Playbill started watching. The first new film or episode will show here." };
    const m = await renderArrivalsEmail(pv.content, { publicUrl, serverName, signature: s.signature }, r(p), 'preview', pv.items);
    return { html: m.html, subject: m.subject, to: p?.email ?? null, note: pv.note };
  }

  if (kind === 'recap') {
    const c = ensureRecapCampaign(d);
    const pv = previewRecap(d, p, tz, now);
    if (!pv) return { empty: 'Nobody watched anything last month, so there is no recap to show yet.' };
    const m = await renderRecapEmail(pv.content, { publicUrl, serverName, signature: signatureOf(c.settings, serverName) }, r(pv.recipient ?? p), 'preview');
    return { html: m.html, subject: m.subject, to: (pv.recipient ?? p)?.email ?? null, note: pv.note };
  }

  if (kind === 'leaving') {
    const c = ensureLeavingCampaign(d, now);
    const pv = previewLeaving(d, p, now);
    if (!pv) return { empty: 'Nothing is planned to leave, and every title has been watched recently.' };
    const m = await renderLeavingEmail(pv.content, { publicUrl, serverName, signature: signatureOf(c.settings, serverName), tz }, r(p), 'preview', pv.items);
    return { html: m.html, subject: m.subject, to: p?.email ?? null, note: pv.note };
  }

  const c = ensureLifecycleCampaign(d, now);
  const pv = previewLifecycle(d, p, kind, serverName, now);
  if (!pv) return { empty: 'Pick a person to preview this email.' };
  const m = await renderLifecycleEmail(pv.content, { publicUrl, signature: signatureOf(c.settings, serverName), tz }, r(p), 'preview');
  return { html: m.html, subject: m.subject, to: p?.email ?? null, note: pv.note };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/**
 * The strip above a preview: the subject line, and the note when the preview isn't exactly what
 * the person would get. Injected into the preview only, never into a sent email.
 */
export function withPreviewStrip(html: string, subject: string, note: string | null): string {
  const strip = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:19px;background:#1d1e22;color:#e7e4dd;padding:10px 16px;border-bottom:1px solid #34353b">
<div><span style="color:#9a968e">Subject</span>&nbsp; ${esc(subject)}</div>${note ? `<div style="margin-top:4px;color:#f0c66b">${esc(note)}</div>` : ''}</div>`;
  return html.replace(/<body([^>]*)>/, (m) => `${m}${strip}`);
}

export function emptyPreview(message: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0c0c0e;color:#d9d4c9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"><p style="max-width:440px;margin:80px auto;padding:0 24px;font-size:15px;line-height:23px;text-align:center">${esc(message)}</p></body></html>`;
}
