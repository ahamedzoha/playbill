import 'server-only';
import { campaignSettings, type Campaign, type Recipient } from '@playbill/core/campaigns';
import type { DigestContent } from '@playbill/core/digest';
import { getSetting } from '@playbill/core/settings';
import { renderDigestHtml, type DigestRenderContext } from '@playbill/emails';
import { db, timezone } from './server';

/** The same context the worker renders with, so previews match what people receive. */
export function digestContext(campaign: Campaign, fallbackUrl: string): DigestRenderContext {
  const s = campaignSettings(campaign);
  return {
    publicUrl: getSetting(db(), 'general')?.publicUrl ?? fallbackUrl,
    serverName: getSetting(db(), 'plex')?.name ?? 'Plex',
    signature: s.signature,
    subject: s.subject,
    intro: s.intro,
    tz: timezone(),
    topic: campaign.topic,
  };
}

export async function renderForRecipient(content: DigestContent, campaign: Campaign, r: Recipient, deliveryId: string, fallbackUrl: string) {
  return renderDigestHtml(content, digestContext(campaign, fallbackUrl), r, deliveryId);
}
