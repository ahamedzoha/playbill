/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Body, Column, Container, Head, Hr, Html, Img, Link, Preview, Row, Section, Text } from '@react-email/components';
import type { DigestContent, DigestItem } from '@playbill/core/digest';
import type { ImageRef } from '@playbill/core/links';

/**
 * The weekly digest. Same world as the admin UI (DESIGN.md): paper-white sheet under a register-blue
 * band, one blue ink, hairline rules. Email-safe: tables via React Email, inline styles, system fonts,
 * images as JPEG from the signed proxy.
 */

const C = {
  paper: '#f3f5f9',
  sheet: '#ffffff',
  ink: '#14171f',
  ink2: '#4b5263',
  ink3: '#626a7b',
  rule: '#e2e6ee',
  rail: '#1b2c57',
  railInk: '#eef2fb',
  railInk2: '#aebbd9',
  blue: '#256abf',
  mark: ['#86b6ef', '#3987e5', '#1c5cab', '#0d366b'],
};

// No web fonts: loading them would tell a font host every time someone opens the email.
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const CAPS = "'Arial Narrow', 'Roboto Condensed', -apple-system, 'Segoe UI', sans-serif";

export interface DigestEmailProps {
  content: DigestContent;
  recipientName: string;
  serverName: string;
  signature: string;
  intro: string;
  tz: string;
  image: (ref: ImageRef) => string;
  links: { webView: string; preferences: string; unsubscribe: string; plex: string };
}

function firstName(name: string): string {
  const n = name.trim().split(/\s+/)[0] ?? '';
  return n && n !== 'there' ? n : 'there';
}

function fmtDay(ts: number, tz: string, withWeekday = false): string {
  return new Intl.DateTimeFormat('en-GB', { ...(withWeekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'short', timeZone: tz })
    .format(ts)
    .replace('Sept', 'Sep');
}

export function digestPreheader(c: DigestContent): string {
  const parts: string[] = [];
  const films = c.added.filter((i) => !i.detail || /^\d{4}$/.test(i.detail)).length;
  const shows = c.added.length - films;
  if (films) parts.push(`${films} new ${films === 1 ? 'film' : 'films'}`);
  if (shows) parts.push(`${shows} ${shows === 1 ? 'show' : 'shows'} with new episodes`);
  if (c.coming.length) parts.push(`${c.coming.length} coming up`);
  return parts.length ? `${parts.join(', ')}.` : 'A quiet week on the server.';
}

function Heading2({ children }: { children: string }) {
  return (
    <Text style={{ margin: '28px 0 12px', fontFamily: CAPS, fontSize: '13px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.ink3 }}>
      {children}
    </Text>
  );
}

function Poster({ item, image, width }: { item: DigestItem; image: DigestEmailProps['image']; width: number }) {
  const h = Math.round(width * 1.5);
  return item.image ? (
    <Img src={image(item.image)} width={width} height={h} alt="" style={{ display: 'block', borderRadius: '6px', backgroundColor: C.rule, objectFit: 'cover' }} />
  ) : (
    <div style={{ width, height: h, borderRadius: '6px', backgroundColor: C.rule }} />
  );
}

function AddedGrid({ items, image }: { items: DigestItem[]; image: DigestEmailProps['image'] }) {
  const rows: DigestItem[][] = [];
  for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));
  return (
    <>
      {rows.map((row, i) => (
        <Row key={i} style={{ marginBottom: '18px' }}>
          {[0, 1, 2].map((j) => {
            const it = row[j];
            return (
              <Column key={j} style={{ width: '33.33%', verticalAlign: 'top', paddingRight: j < 2 ? '12px' : 0 }}>
                {it && (
                  <>
                    <Poster item={it} image={image} width={160} />
                    <Text style={{ margin: '8px 0 0', fontSize: '14px', lineHeight: '19px', fontWeight: 600, color: C.ink }}>{it.title}</Text>
                    {it.detail && <Text style={{ margin: '2px 0 0', fontSize: '13px', lineHeight: '18px', color: C.ink3 }}>{it.detail}</Text>}
                  </>
                )}
              </Column>
            );
          })}
        </Row>
      ))}
    </>
  );
}

function ListRows({ items, image, meta }: { items: DigestItem[]; image: DigestEmailProps['image']; meta: (item: DigestItem, i: number) => string | null }) {
  return (
    <>
      {items.map((it, i) => (
        <Row key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.rule}` }}>
          <Column style={{ width: '52px', padding: '10px 0', verticalAlign: 'middle' }}>
            <Poster item={it} image={image} width={40} />
          </Column>
          <Column style={{ padding: '10px 0 10px 12px', verticalAlign: 'middle' }}>
            <Text style={{ margin: 0, fontSize: '15px', lineHeight: '20px', fontWeight: 600, color: C.ink }}>{it.title}</Text>
            {meta(it, i) && <Text style={{ margin: '2px 0 0', fontSize: '13px', lineHeight: '18px', color: C.ink3 }}>{meta(it, i)}</Text>}
          </Column>
        </Row>
      ))}
    </>
  );
}

export function DigestEmail(p: DigestEmailProps) {
  const c = p.content;
  const range = `${fmtDay(c.windowStart, p.tz)} – ${fmtDay(c.windowEnd - 1, p.tz)}`;
  const quiet = c.added.length === 0 && c.addedOther === 0;

  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{digestPreheader(c)}</Preview>
      <Body style={{ margin: 0, backgroundColor: C.paper, fontFamily: FONT, color: C.ink, WebkitFontSmoothing: 'antialiased' }}>
        <Container style={{ width: '100%', maxWidth: '600px', margin: '0 auto', padding: '24px 12px' }}>
          <Section style={{ backgroundColor: C.rail, borderRadius: '12px 12px 0 0', padding: '20px 28px' }}>
            <Row>
              <Column style={{ verticalAlign: 'middle', width: '100%' }}>
                <Text style={{ margin: 0, fontSize: '17px', lineHeight: '22px', fontWeight: 600, color: C.railInk, letterSpacing: '-0.01em' }}>{p.serverName}</Text>
              </Column>
              <Column style={{ verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                <Text style={{ margin: 0, fontFamily: CAPS, fontSize: '12px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.railInk2 }}>
                  {range}
                </Text>
              </Column>
            </Row>
          </Section>

          <Section style={{ backgroundColor: C.sheet, borderRadius: '0 0 12px 12px', padding: '28px 28px 32px', border: `1px solid ${C.rule}`, borderTop: 'none' }}>
            <Text style={{ margin: 0, fontSize: '24px', lineHeight: '30px', fontWeight: 600, letterSpacing: '-0.02em', color: C.ink }}>
              Hey {firstName(p.recipientName)},
            </Text>
            <Text style={{ margin: '10px 0 0', fontSize: '16px', lineHeight: '25px', color: C.ink2 }}>
              {quiet ? `A quiet week on ${p.serverName}, but here's what's coming.` : `Here's what landed on ${p.serverName} this week.`}
            </Text>
            {p.intro.trim() &&
              p.intro
                .trim()
                .split(/\n{2,}/)
                .map((para, i) => (
                  <Text key={i} style={{ margin: '12px 0 0', fontSize: '16px', lineHeight: '25px', color: C.ink }}>
                    {para}
                  </Text>
                ))}

            {c.added.length > 0 && (
              <>
                <Heading2>New this week</Heading2>
                <AddedGrid items={c.added} image={p.image} />
                {c.addedOther > 0 && (
                  <Text style={{ margin: '0 0 4px', fontSize: '14px', color: C.ink3 }}>
                    And {c.addedOther} more.{' '}
                    <Link href={p.links.plex} style={{ color: C.blue }}>
                      See everything in Plex
                    </Link>
                  </Text>
                )}
              </>
            )}

            {c.requests.length > 0 && (
              <>
                <Heading2>Requests that arrived</Heading2>
                <ListRows items={c.requests} image={p.image} meta={(it) => it.detail} />
              </>
            )}

            {c.coming.length > 0 && (
              <>
                <Heading2>Coming up</Heading2>
                <ListRows items={c.coming} image={p.image} meta={(it, i) => [it.detail, fmtDay(c.coming[i]!.at, p.tz, true)].filter(Boolean).join(' · ')} />
              </>
            )}

            {c.stats && c.stats.plays > 0 && (
              <>
                <Hr style={{ borderColor: C.rule, margin: '28px 0 0' }} />
                <Text style={{ margin: '18px 0 0', fontSize: '15px', lineHeight: '23px', color: C.ink2 }}>
                  {c.stats.watchers} of us watched something this week: {c.stats.hours.toLocaleString('en')} hours across{' '}
                  {c.stats.plays.toLocaleString('en')} plays.
                  {c.stats.topTitle ? ` Most watched: ${c.stats.topTitle}.` : ''}
                </Text>
              </>
            )}

            <Section style={{ marginTop: '28px' }}>
              <Link
                href={p.links.plex}
                style={{ display: 'inline-block', backgroundColor: C.rail, color: C.railInk, fontSize: '15px', fontWeight: 600, padding: '12px 20px', borderRadius: '8px', textDecoration: 'none' }}
              >
                Open Plex
              </Link>
            </Section>

            <Text style={{ margin: '28px 0 0', fontSize: '16px', lineHeight: '24px', color: C.ink }}>Happy watching,</Text>
            <Text style={{ margin: '2px 0 0', fontSize: '16px', lineHeight: '24px', fontWeight: 600, color: C.ink }}>{p.signature}</Text>
          </Section>

          <Section style={{ padding: '20px 28px 0' }}>
            <Text style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: C.ink3 }}>
              You're getting this because {p.serverName} shares its library with you.{' '}
              <Link href={p.links.preferences} style={{ color: C.ink3, textDecoration: 'underline' }}>
                Choose what you get
              </Link>{' '}
              ·{' '}
              <Link href={p.links.unsubscribe} style={{ color: C.ink3, textDecoration: 'underline' }}>
                Unsubscribe
              </Link>{' '}
              ·{' '}
              <Link href={p.links.webView} style={{ color: C.ink3, textDecoration: 'underline' }}>
                View in a browser
              </Link>
            </Text>
            <Text style={{ margin: '8px 0 0', fontSize: '11px', lineHeight: '16px', color: C.ink3 }}>Sent with Playbill</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
