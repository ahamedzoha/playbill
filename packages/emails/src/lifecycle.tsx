/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Section, Text } from '@react-email/components';
import type { LifecycleContent } from '@playbill/core/lifecycle';
import type { ImageRef } from '@playbill/core/links';
import { Billing, C, DateLine, Fact, GoldButton, Greeting, Note, Pad, PosterRow, SheetHeading, SheetTitle, Shell, Signoff } from './theme';

export interface LifecycleEmailProps {
  content: LifecycleContent;
  recipientName: string;
  signature: string;
  tz: string;
  image: (ref: ImageRef) => string;
  links: { preferences: string; plex: string };
}

function date(ts: number, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(ts).replace('Sept', 'Sep');
}
const short = (ts: number, tz: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).format(ts).replace('Sept', 'Sep');

export function lifecycleSubject(c: LifecycleContent, tz: string): string {
  if (c.type === 'nudge') return `It's been a while — here's what's new on ${c.serverName}`;
  if (c.type === 'warning') return `Your access to ${c.serverName} ends ${date(c.deadline, tz)}`;
  return `Your access to ${c.serverName} has ended`;
}

/**
 * Account notices on the same sheet, without a poster: a friendly nudge, a clear warning whose gold
 * line is the deadline, a short goodbye. Personal, never a form letter in tone.
 */
export function LifecycleEmail(p: LifecycleEmailProps) {
  const c = p.content;
  const title = c.type === 'nudge' ? "It's been a while" : c.type === 'warning' ? 'Still watching?' : 'Thanks for watching';
  const line = c.type === 'nudge' ? 'New since your last visit' : c.type === 'warning' ? `Play anything by ${short(c.deadline, p.tz)}` : 'Your access has ended';
  const items = c.type === 'goodbye' ? [] : c.items;
  return (
    <Shell preview={c.type === 'nudge' ? 'A few things you might have missed.' : c.type === 'warning' ? 'Play anything before then to keep it.' : 'Thanks for watching with us.'}>
      <Section style={{ height: '34px', backgroundColor: C.ink }} />
      <Pad>
        <SheetTitle>{title}</SheetTitle>
        <Billing
          lines={[
            <>
              A note from <Fact>{c.serverName}</Fact>
            </>,
          ]}
        />
      </Pad>
      <DateLine>{line}</DateLine>
      <Pad>
        <Greeting name={p.recipientName}>
          {c.type === 'nudge' && (
            <Note>
              {c.lastTitle
                ? `We haven't seen you on ${c.serverName} since you watched ${c.lastTitle}. Here's some of what's arrived since then.`
                : `You haven't watched anything on ${c.serverName} yet. Here's some of what's there.`}
            </Note>
          )}
          {c.type === 'warning' && (
            <>
              <Note>{`Nobody's watched anything on your ${c.serverName} account for a while, so to keep the server tidy your access will end on ${date(c.deadline, p.tz)}.`}</Note>
              <Note style={{ color: C.paper, fontWeight: 700 }}>Want to keep it? Just play anything before then. Even a few minutes counts, and you'll stay on.</Note>
            </>
          )}
          {c.type === 'goodbye' && (
            <>
              <Note>{`Your access to ${c.serverName} has ended, since it hadn't been used in a long time.`}</Note>
              <Note>Thanks for watching with us. If you'd like it back, just reply and ask.</Note>
            </>
          )}
        </Greeting>
        {c.type !== 'goodbye' && <GoldButton href={p.links.plex}>Open Plex</GoldButton>}
        {items.length > 0 && (
          <>
            <SheetHeading>{c.type === 'nudge' ? 'Since you were last here' : 'Arrived recently'}</SheetHeading>
            {items.map((it, i) => (
              <PosterRow key={i} first={i === 0} src={it.image ? p.image(it.image) : null} title={it.title} detail={it.detail} />
            ))}
          </>
        )}
        <Signoff greeting={c.type === 'goodbye' ? 'All the best,' : 'See you there,'} signature={p.signature} />
      </Pad>
      {c.type === 'nudge' ? (
        <Section style={{ padding: '0 22px 36px', backgroundColor: C.ink }}>
          <Text style={{ margin: '44px 0 0', padding: '18px 0 0', borderTop: `1px solid ${C.rule}`, fontSize: '12px', lineHeight: '19px', textAlign: 'center' }}>
            <a href={p.links.preferences} style={{ color: C.link, textDecoration: 'underline' }}>
              Choose what you get
            </a>
          </Text>
        </Section>
      ) : (
        <Section style={{ height: '36px', backgroundColor: C.ink }} />
      )}
    </Shell>
  );
}
