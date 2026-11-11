import { eq } from 'drizzle-orm';
import { campaignSettings, ensureDigestCampaign } from '@playbill/core/campaigns';
import { people } from '@playbill/core/db/schema';
import { buildDigest } from '@playbill/core/digest';
import { radarrs, seerr, sonarrs, tautulli } from '@playbill/core/integrations';
import { renderForRecipient } from '@/lib/digest';
import { currentOwner, db } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** This week's digest as one person would get it, built live (nothing is saved or sent). */
export async function GET(req: Request) {
  if (!(await currentOwner())) return new Response('Sign in first', { status: 401 });
  const d = db();
  const c = ensureDigestCampaign(d);
  const s = campaignSettings(c);
  const url = new URL(req.url);
  const person = url.searchParams.get('for');
  const p = person ? d.select().from(people).where(eq(people.plexUserId, person)).get() : null;
  const now = Date.now();
  const content = await buildDigest(d, { tautulli: tautulli(d), seerr: seerr(d), sonarrs: sonarrs(d), radarrs: radarrs(d) }, s, now - 7 * 86_400_000, now);
  const { html } = await renderForRecipient(
    content,
    c,
    { plexUserId: p?.plexUserId ?? null, email: p?.email ?? 'preview@example.com', name: p?.displayName ?? 'there' },
    'preview',
    url.origin,
  );
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
