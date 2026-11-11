import { eq } from 'drizzle-orm';
import { campaigns, deliveries, runs } from '@playbill/core/db/schema';
import type { DigestContent } from '@playbill/core/digest';
import { readViewToken } from '@playbill/core/links';
import { renderForRecipient } from '@/lib/digest';
import { db } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** "View in a browser": re-renders exactly what this person was sent, from the run's frozen content. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = readViewToken(token);
  if (!id) return new Response('This link is not valid.', { status: 404 });
  const d = db();
  const delivery = d.select().from(deliveries).where(eq(deliveries.id, id)).get();
  const run = delivery && d.select().from(runs).where(eq(runs.id, delivery.runId)).get();
  const campaign = run && d.select().from(campaigns).where(eq(campaigns.id, run.campaignId)).get();
  if (!delivery || !run?.content || !campaign) return new Response('This email is no longer available.', { status: 404 });
  const { html } = await renderForRecipient(
    run.content as unknown as DigestContent,
    campaign,
    { plexUserId: delivery.plexUserId, email: delivery.email, name: delivery.name },
    delivery.id,
    new URL(req.url).origin,
  );
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  });
}
