/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Body, Column, Container, Head, Html, Img, Link, Preview, Row, Section, Text } from '@react-email/components';
import type { LeavingContent } from '@playbill/core/library';
import type { ImageRef } from '@playbill/core/links';

const C = { paper: '#f3f5f9', sheet: '#ffffff', ink: '#14171f', ink2: '#4b5263', ink3: '#626a7b', rule: '#e2e6ee', rail: '#1b2c57', railInk: '#eef2fb' };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface LeavingEmailProps {
  items: LeavingContent['items'];
  recipientName: string;
  serverName: string;
  signature: string;
  tz: string;
  image: (ref: ImageRef) => string;
  links: { preferences: string; unsubscribe: string; plex: string };
}

const day = (ts: number, tz: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(ts).replace('Sept', 'Sep');

export function leavingSubject(items: LeavingContent['items']): string {
  return items.length === 1 ? `${items[0]!.title} is leaving soon` : `${items.length} things you watched are leaving soon`;
}

/** A heads-up to people who watched something that's about to go, with the date and nothing else to do but watch. */
export function LeavingEmail(p: LeavingEmailProps) {
  const first = p.recipientName.trim().split(/\s+/)[0] || 'there';
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light only" />
      </Head>
      <Preview>{`Watch ${p.items.length === 1 ? 'it' : 'them'} before ${day(Math.min(...p.items.map((i) => i.removeAt)), p.tz)}.`}</Preview>
      <Body style={{ margin: 0, backgroundColor: C.paper, fontFamily: FONT, color: C.ink }}>
        <Container style={{ width: '100%', maxWidth: '560px', margin: '0 auto', padding: '24px 12px' }}>
          <Section style={{ backgroundColor: C.sheet, borderRadius: '12px', border: `1px solid ${C.rule}`, padding: '28px' }}>
            <Text style={{ margin: 0, fontSize: '22px', lineHeight: '28px', fontWeight: 600, letterSpacing: '-0.02em' }}>Hey {first},</Text>
            <Text style={{ margin: '8px 0 16px', fontSize: '16px', lineHeight: '24px', color: C.ink2 }}>
              To make room on {p.serverName}, {p.items.length === 1 ? 'something you watched is' : 'a few things you watched are'} leaving soon. If you want to finish or rewatch, now's the time.
            </Text>
            {p.items.map((it, i) => (
              <Row key={it.key} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.rule}` }}>
                <Column style={{ width: '60px', padding: '10px 0', verticalAlign: 'middle' }}>
                  {it.image ? <Img src={p.image(it.image)} width={48} height={72} alt="" style={{ display: 'block', borderRadius: '5px', backgroundColor: C.rule }} /> : <div style={{ width: 48, height: 72, borderRadius: '5px', backgroundColor: C.rule }} />}
                </Column>
                <Column style={{ padding: '10px 0 10px 12px', verticalAlign: 'middle' }}>
                  <Text style={{ margin: 0, fontSize: '16px', lineHeight: '21px', fontWeight: 600 }}>{it.title}</Text>
                  <Text style={{ margin: '3px 0 0', fontSize: '14px', color: C.ink3 }}>Leaving {day(it.removeAt, p.tz)}</Text>
                </Column>
              </Row>
            ))}
            <Section style={{ marginTop: '22px' }}>
              <Link href={p.links.plex} style={{ display: 'inline-block', backgroundColor: C.rail, color: C.railInk, fontSize: '15px', fontWeight: 600, padding: '12px 20px', borderRadius: '8px', textDecoration: 'none' }}>
                Watch in Plex
              </Link>
            </Section>
            <Text style={{ margin: '24px 0 0', fontSize: '15px', lineHeight: '22px' }}>
              Cheers,
              <br />
              <strong>{p.signature}</strong>
            </Text>
          </Section>
          <Section style={{ padding: '18px 28px 0' }}>
            <Text style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: C.ink3 }}>
              You get these for things you've watched.{' '}
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
