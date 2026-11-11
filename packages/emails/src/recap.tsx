/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Body, Column, Container, Head, Html, Link, Preview, Row, Section, Text } from '@react-email/components';
import type { PersonRecap } from '@playbill/core/recap';

const C = { paper: '#f3f5f9', sheet: '#ffffff', ink: '#14171f', ink2: '#4b5263', ink3: '#626a7b', rule: '#e2e6ee', rail: '#1b2c57', railInk: '#eef2fb', railInk2: '#aebbd9', mark: ['#e6eaf1', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'] };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const CAPS = "'Arial Narrow', 'Roboto Condensed', -apple-system, 'Segoe UI', sans-serif";
const DAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

export interface RecapEmailProps {
  recap: PersonRecap;
  monthLabel: string;
  serverName: string;
  signature: string;
  links: { preferences: string; unsubscribe: string; plex: string };
}

export function recapSubject(monthLabel: string): string {
  return `Your ${monthLabel.split(' ')[0]} on Plex`;
}

function hoursText(h: number): string {
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} minutes` : `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

function change(cur: number, prev: number): string | null {
  if (prev <= 0) return null;
  const diff = Math.round(((cur - prev) / prev) * 100);
  if (Math.abs(diff) < 10) return 'about the same as the month before';
  return `${Math.abs(diff)}% ${diff > 0 ? 'more' : 'less'} than the month before`;
}

/** A personal month: big numbers set in a sentence, top titles as a short ruled list, one nudge to finish something. */
export function RecapEmail(p: RecapEmailProps) {
  const r = p.recap;
  const first = r.name.trim().split(/\s+/)[0] || 'there';
  const month = p.monthLabel.split(' ')[0];
  const vs = change(r.hours, r.previousHours);
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light only" />
      </Head>
      <Preview>{`${hoursText(r.hours)} across ${r.activeDays} ${r.activeDays === 1 ? 'day' : 'days'}${r.top[0] ? `, mostly ${r.top[0].title}` : ''}.`}</Preview>
      <Body style={{ margin: 0, backgroundColor: C.paper, fontFamily: FONT, color: C.ink }}>
        <Container style={{ width: '100%', maxWidth: '560px', margin: '0 auto', padding: '24px 12px' }}>
          <Section style={{ backgroundColor: C.rail, borderRadius: '12px 12px 0 0', padding: '22px 28px' }}>
            <Text style={{ margin: 0, fontFamily: CAPS, fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.railInk2 }}>{p.monthLabel} on {p.serverName}</Text>
            <Text style={{ margin: '6px 0 0', fontSize: '26px', lineHeight: '32px', fontWeight: 600, letterSpacing: '-0.02em', color: C.railInk }}>
              {first}, you watched {hoursText(r.hours)} in {month}.
            </Text>
          </Section>
          <Section style={{ backgroundColor: C.sheet, borderRadius: '0 0 12px 12px', border: `1px solid ${C.rule}`, borderTop: 'none', padding: '24px 28px 28px' }}>
            <Text style={{ margin: 0, fontSize: '16px', lineHeight: '25px', color: C.ink2 }}>
              That's {r.plays} {r.plays === 1 ? 'play' : 'plays'} across {r.activeDays} {r.activeDays === 1 ? 'day' : 'days'}
              {vs ? `, ${vs}` : ''}.{r.favouriteDay !== null ? ` ${DAYS[r.favouriteDay]} were your big nights.` : ''}
            </Text>

            {r.top.length > 0 && (
              <>
                <Text style={{ margin: '24px 0 8px', fontFamily: CAPS, fontSize: '13px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.ink3 }}>What you watched most</Text>
                {r.top.map((t, i) => (
                  <Row key={t.title} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.rule}` }}>
                    <Column style={{ width: '28px', padding: '10px 0', verticalAlign: 'middle' }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: C.mark[4 - i] }} />
                    </Column>
                    <Column style={{ padding: '10px 0', verticalAlign: 'middle' }}>
                      <Text style={{ margin: 0, fontSize: '16px', lineHeight: '21px', fontWeight: 600 }}>{t.title}</Text>
                    </Column>
                    <Column style={{ padding: '10px 0', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Text style={{ margin: 0, fontSize: '14px', color: C.ink3 }}>{hoursText(t.hours)}</Text>
                    </Column>
                  </Row>
                ))}
              </>
            )}

            {r.unfinished.length > 0 && (
              <Text style={{ margin: '24px 0 0', fontSize: '15px', lineHeight: '23px', color: C.ink }}>
                Still to finish: {r.unfinished.map((u) => `${u.title} (${u.percent}% in)`).join(' and ')}.
              </Text>
            )}

            <Section style={{ marginTop: '24px' }}>
              <Link href={p.links.plex} style={{ display: 'inline-block', backgroundColor: C.rail, color: C.railInk, fontSize: '15px', fontWeight: 600, padding: '12px 20px', borderRadius: '8px', textDecoration: 'none' }}>
                Keep watching
              </Link>
            </Section>
            <Text style={{ margin: '24px 0 0', fontSize: '15px', lineHeight: '22px' }}>
              Thanks for watching,
              <br />
              <strong>{p.signature}</strong>
            </Text>
          </Section>
          <Section style={{ padding: '18px 28px 0' }}>
            <Text style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: C.ink3 }}>
              Only you get this; nobody else sees your numbers.{' '}
              <Link href={p.links.preferences} style={{ color: C.ink3, textDecoration: 'underline' }}>
                Choose what you get
              </Link>{' '}
              ·{' '}
              <Link href={p.links.unsubscribe} style={{ color: C.ink3, textDecoration: 'underline' }}>
                Stop recaps
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
