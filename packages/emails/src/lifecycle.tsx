/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Body, Column, Container, Head, Html, Img, Link, Preview, Row, Section, Text } from '@react-email/components';
import type { LifecycleContent, LifecycleItem } from '@playbill/core/lifecycle';
import type { ImageRef } from '@playbill/core/links';

const C = { paper: '#f3f5f9', sheet: '#ffffff', ink: '#14171f', ink2: '#4b5263', ink3: '#626a7b', rule: '#e2e6ee', rail: '#1b2c57', railInk: '#eef2fb' };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface LifecycleEmailProps {
  content: LifecycleContent;
  recipientName: string;
  signature: string;
  tz: string;
  image: (ref: ImageRef) => string;
  links: { preferences: string; plex: string };
}

const firstName = (n: string) => (n.trim().split(/\s+/)[0] || 'there');

function date(ts: number, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(ts).replace('Sept', 'Sep');
}

export function lifecycleSubject(c: LifecycleContent, tz: string): string {
  if (c.type === 'nudge') return `It's been a while — here's what's new on ${c.serverName}`;
  if (c.type === 'warning') return `Your access to ${c.serverName} ends ${date(c.deadline, tz)}`;
  return `Your access to ${c.serverName} has ended`;
}

function Items({ items, image }: { items: LifecycleItem[]; image: LifecycleEmailProps['image'] }) {
  return (
    <>
      {items.map((it, i) => (
        <Row key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.rule}` }}>
          <Column style={{ width: '56px', padding: '10px 0', verticalAlign: 'middle' }}>
            {it.image ? <Img src={image(it.image)} width={44} height={66} alt="" style={{ display: 'block', borderRadius: '5px', backgroundColor: C.rule }} /> : <div style={{ width: 44, height: 66, borderRadius: '5px', backgroundColor: C.rule }} />}
          </Column>
          <Column style={{ padding: '10px 0 10px 12px', verticalAlign: 'middle' }}>
            <Text style={{ margin: 0, fontSize: '15px', lineHeight: '20px', fontWeight: 600 }}>{it.title}</Text>
            <Text style={{ margin: '2px 0 0', fontSize: '13px', lineHeight: '18px', color: C.ink3 }}>{it.detail}</Text>
          </Column>
        </Row>
      ))}
    </>
  );
}

/** Account notices: a friendly nudge, a clear warning, a short goodbye. Personal, never a form letter in tone. */
export function LifecycleEmail(p: LifecycleEmailProps) {
  const c = p.content;
  const text = (s: string, extra: React.CSSProperties = {}) => <Text style={{ margin: '10px 0 0', fontSize: '16px', lineHeight: '25px', color: C.ink, ...extra }}>{s}</Text>;
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light only" />
      </Head>
      <Preview>{c.type === 'nudge' ? 'A few things you might have missed.' : c.type === 'warning' ? 'Play anything before then to keep it.' : 'Thanks for watching with us.'}</Preview>
      <Body style={{ margin: 0, backgroundColor: C.paper, fontFamily: FONT, color: C.ink }}>
        <Container style={{ width: '100%', maxWidth: '560px', margin: '0 auto', padding: '24px 12px' }}>
          <Section style={{ backgroundColor: C.sheet, borderRadius: '12px', border: `1px solid ${C.rule}`, padding: '28px' }}>
            <Text style={{ margin: 0, fontSize: '22px', lineHeight: '28px', fontWeight: 600, letterSpacing: '-0.02em' }}>Hey {firstName(p.recipientName)},</Text>
            {c.type === 'nudge' && (
              <>
                {text(
                  c.lastTitle
                    ? `We haven't seen you on ${c.serverName} since you watched ${c.lastTitle}. Here's some of what's arrived since then.`
                    : `You haven't watched anything on ${c.serverName} yet. Here's some of what's there.`,
                  { color: C.ink2 },
                )}
                {c.items.length > 0 && (
                  <Section style={{ marginTop: '14px' }}>
                    <Items items={c.items} image={p.image} />
                  </Section>
                )}
              </>
            )}
            {c.type === 'warning' && (
              <>
                {text(`Nobody's watched anything on your ${c.serverName} account for a while, so to keep the server tidy your access will end on ${date(c.deadline, p.tz)}.`)}
                {text("Want to keep it? Just play anything before then. Even a few minutes counts, and you'll stay on.", { fontWeight: 600 })}
                {c.items.length > 0 && (
                  <>
                    {text('A few things that arrived recently:', { color: C.ink2, fontSize: '15px' })}
                    <Section style={{ marginTop: '6px' }}>
                      <Items items={c.items} image={p.image} />
                    </Section>
                  </>
                )}
              </>
            )}
            {c.type === 'goodbye' && (
              <>
                {text(`Your access to ${c.serverName} has ended, since it hadn't been used in a long time.`)}
                {text('Thanks for watching with us. If you\'d like it back, just reply and ask.', { color: C.ink2 })}
              </>
            )}
            {c.type !== 'goodbye' && (
              <Section style={{ marginTop: '22px' }}>
                <Link href={p.links.plex} style={{ display: 'inline-block', backgroundColor: C.rail, color: C.railInk, fontSize: '15px', fontWeight: 600, padding: '12px 20px', borderRadius: '8px', textDecoration: 'none' }}>
                  Open Plex
                </Link>
              </Section>
            )}
            <Text style={{ margin: '24px 0 0', fontSize: '15px', lineHeight: '22px' }}>
              {c.type === 'goodbye' ? 'All the best,' : 'See you there,'}
              <br />
              <strong>{p.signature}</strong>
            </Text>
          </Section>
          {c.type === 'nudge' && (
            <Section style={{ padding: '18px 28px 0' }}>
              <Text style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: C.ink3 }}>
                <Link href={p.links.preferences} style={{ color: C.ink3, textDecoration: 'underline' }}>
                  Choose what you get
                </Link>
              </Text>
            </Section>
          )}
        </Container>
      </Body>
    </Html>
  );
}
