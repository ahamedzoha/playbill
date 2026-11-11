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

// ---------------------------------------------------------------------------------------------
// New arrivals

import type { ArrivalsContent } from '@playbill/core/arrivals';
import { ArrivalsEmail, arrivalsSubject } from './arrivals';

export { ArrivalsEmail, arrivalsSubject };

export interface ArrivalsRenderContext {
  publicUrl: string;
  serverName: string;
  signature: string;
}

/** One person's arrivals email: only the items planned for them, with one-click unsubscribe. */
export async function renderArrivalsEmail(content: ArrivalsContent, ctx: ArrivalsRenderContext, r: Recipient, deliveryId: string, itemKeys: string[] | null): Promise<OutgoingEmail> {
  const items = itemKeys ? content.items.filter((i) => itemKeys.includes(i.key)) : content.items;
  if (items.length === 0) throw new Error('No items for this person');
  const token = preferenceToken(r.plexUserId ?? 'test');
  const links = {
    preferences: joinUrl(ctx.publicUrl, `/u/${token}`),
    unsubscribe: joinUrl(ctx.publicUrl, `/u/${token}?unsubscribe=arrivals`),
    plex: 'https://app.plex.tv/desktop',
  };
  const el = createElement(ArrivalsEmail, {
    items,
    recipientName: r.name,
    serverName: ctx.serverName,
    signature: ctx.signature,
    image: (ref) => joinUrl(ctx.publicUrl, `/img/${imageToken(ref)}`),
    links,
  });
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return {
    to: r.email,
    toName: r.name,
    subject: arrivalsSubject(items),
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${joinUrl(ctx.publicUrl, `/api/unsubscribe/${token}?topic=arrivals`)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    idempotencyKey: deliveryId,
  };
}

// ---------------------------------------------------------------------------------------------
// Account notices (nudge, warning, goodbye)

import type { LifecycleContent } from '@playbill/core/lifecycle';
import { LifecycleEmail, lifecycleSubject } from './lifecycle';

export { LifecycleEmail, lifecycleSubject };

export async function renderLifecycleEmail(content: LifecycleContent, ctx: { publicUrl: string; signature: string; tz: string }, r: Recipient, deliveryId: string): Promise<OutgoingEmail> {
  const token = preferenceToken(r.plexUserId ?? 'test');
  const el = createElement(LifecycleEmail, {
    content,
    recipientName: r.name,
    signature: ctx.signature,
    tz: ctx.tz,
    image: (ref) => joinUrl(ctx.publicUrl, `/img/${imageToken(ref)}`),
    links: { preferences: joinUrl(ctx.publicUrl, `/u/${token}`), plex: 'https://app.plex.tv/desktop' },
  });
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  // Warnings and goodbyes are about their access, so they carry no unsubscribe header; nudges do.
  const headers: Record<string, string> =
    content.type === 'nudge'
      ? { 'List-Unsubscribe': `<${joinUrl(ctx.publicUrl, `/api/unsubscribe/${token}?topic=account`)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      : {};
  return { to: r.email, toName: r.name, subject: lifecycleSubject(content, ctx.tz), html, text, headers, idempotencyKey: deliveryId };
}
