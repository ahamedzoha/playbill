import { render } from '@react-email/render';
import { createElement } from 'react';
import type { Recipient } from '@playbill/core/campaigns';
import type { DigestContent } from '@playbill/core/digest';
import { imageToken, joinUrl, preferenceToken, viewToken } from '@playbill/core/links';
import type { OutgoingEmail } from '@playbill/core/mail';
import { DigestEmail, digestPreheader } from './digest';

export { DigestEmail, digestPreheader };

export interface DigestRenderContext {
  publicUrl: string;
  serverName: string;
  signature: string;
  subject: string;
  intro: string;
  tz: string;
  topic: string;
}

/** Recipients without a Playbill person (test addresses) get links to a harmless "test" page. */
function prefToken(r: Recipient): string {
  return preferenceToken(r.plexUserId ?? 'test');
}

export function digestLinks(ctx: DigestRenderContext, r: Recipient, deliveryId: string) {
  const token = prefToken(r);
  return {
    webView: joinUrl(ctx.publicUrl, `/v/${viewToken(deliveryId)}`),
    preferences: joinUrl(ctx.publicUrl, `/u/${token}`),
    unsubscribe: joinUrl(ctx.publicUrl, `/u/${token}?unsubscribe=${ctx.topic}`),
    oneClick: joinUrl(ctx.publicUrl, `/api/unsubscribe/${token}?topic=${ctx.topic}`),
    plex: 'https://app.plex.tv/desktop',
  };
}

export async function renderDigestHtml(content: DigestContent, ctx: DigestRenderContext, r: Recipient, deliveryId: string) {
  const links = digestLinks(ctx, r, deliveryId);
  const el = createElement(DigestEmail, {
    content,
    recipientName: r.name,
    serverName: ctx.serverName,
    signature: ctx.signature,
    intro: ctx.intro,
    tz: ctx.tz,
    image: (ref) => joinUrl(ctx.publicUrl, `/img/${imageToken(ref)}`),
    links,
  });
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { html, text, links };
}

/** A complete outgoing email for one recipient, with one-click unsubscribe headers (RFC 8058). */
export async function renderDigestEmail(content: DigestContent, ctx: DigestRenderContext, r: Recipient, deliveryId: string): Promise<OutgoingEmail> {
  const { html, text, links } = await renderDigestHtml(content, ctx, r, deliveryId);
  return {
    to: r.email,
    toName: r.name,
    subject: ctx.subject.replaceAll('{server}', ctx.serverName),
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${links.oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    idempotencyKey: deliveryId,
  };
}
