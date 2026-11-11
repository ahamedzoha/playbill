/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Body, Column, Container, Head, Html, Img, Link, Preview, Row, Section, Text } from '@react-email/components';
import type { ArrivalItem } from '@playbill/core/arrivals';
import type { ImageRef } from '@playbill/core/links';

const C = { paper: '#f3f5f9', sheet: '#ffffff', ink: '#14171f', ink2: '#4b5263', ink3: '#626a7b', rule: '#e2e6ee', rail: '#1b2c57', railInk: '#eef2fb' };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface ArrivalsEmailProps {
  items: ArrivalItem[];
  recipientName: string;
  serverName: string;
  signature: string;
  image: (ref: ImageRef) => string;
  links: { preferences: string; unsubscribe: string; plex: string };
}

export function arrivalsSubject(items: ArrivalItem[]): string {
  if (items.length === 1) return `${items[0]!.title} is ready to watch`;
  return `${items[0]!.title} and ${items.length - 1} more ${items.length === 2 ? 'is' : 'are'} ready to watch`;
}

function firstName(name: string): string {
  const n = name.trim().split(/\s+/)[0] ?? '';
  return n && n !== 'there' ? n : 'there';
}

/** A short, personal "it's here" note: one row per title, why it's for them, one button. */
export function ArrivalsEmail(p: ArrivalsEmailProps) {
  const follows = p.items.some((i) => i.kind === 'show' && !i.newSeries);
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light only" />
      </Head>
      <Preview>{p.items.map((i) => i.title).join(', ')}</Preview>
      <Body style={{ margin: 0, backgroundColor: C.paper, fontFamily: FONT, color: C.ink }}>
        <Container style={{ width: '100%', maxWidth: '560px', margin: '0 auto', padding: '24px 12px' }}>
          <Section style={{ backgroundColor: C.sheet, borderRadius: '12px', border: `1px solid ${C.rule}`, padding: '28px' }}>
            <Text style={{ margin: 0, fontSize: '22px', lineHeight: '28px', fontWeight: 600, letterSpacing: '-0.02em' }}>Hey {firstName(p.recipientName)},</Text>
            <Text style={{ margin: '8px 0 18px', fontSize: '16px', lineHeight: '24px', color: C.ink2 }}>
              {p.items.length === 1 ? 'Something you might like' : 'A few things you might like'} just landed on {p.serverName}.
            </Text>
            {p.items.map((it, i) => (
              <Row key={it.key} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.rule}` }}>
                <Column style={{ width: '64px', padding: '12px 0', verticalAlign: 'middle' }}>
                  {it.image ? (
                    <Img src={p.image(it.image)} width={52} height={78} alt="" style={{ display: 'block', borderRadius: '6px', backgroundColor: C.rule }} />
                  ) : (
                    <div style={{ width: 52, height: 78, borderRadius: '6px', backgroundColor: C.rule }} />
                  )}
                </Column>
                <Column style={{ padding: '12px 0 12px 14px', verticalAlign: 'middle' }}>
                  <Text style={{ margin: 0, fontSize: '16px', lineHeight: '21px', fontWeight: 600 }}>{it.title}</Text>
                  <Text style={{ margin: '3px 0 0', fontSize: '14px', lineHeight: '19px', color: C.ink3 }}>
                    {it.detail}
                    {it.kind === 'show' && !it.newSeries ? " · you've been watching this" : ''}
                  </Text>
                </Column>
              </Row>
            ))}
            <Section style={{ marginTop: '22px' }}>
              <Link href={p.links.plex} style={{ display: 'inline-block', backgroundColor: C.rail, color: C.railInk, fontSize: '15px', fontWeight: 600, padding: '12px 20px', borderRadius: '8px', textDecoration: 'none' }}>
                Watch in Plex
              </Link>
            </Section>
            <Text style={{ margin: '24px 0 0', fontSize: '15px', lineHeight: '22px' }}>
              Enjoy,
              <br />
              <strong>{p.signature}</strong>
            </Text>
          </Section>
          <Section style={{ padding: '18px 28px 0' }}>
            <Text style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: C.ink3 }}>
              {follows ? 'You get these for shows you watch and new films. ' : 'You get these when new films and series arrive. '}
              <Link href={p.links.preferences} style={{ color: C.ink3, textDecoration: 'underline' }}>
                Choose what you get
              </Link>{' '}
              ·{' '}
              <Link href={p.links.unsubscribe} style={{ color: C.ink3, textDecoration: 'underline' }}>
                Stop these
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
