/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { LeavingContent } from '@playbill/core/library';
import type { ImageRef } from '@playbill/core/links';
import { Billing, DateLine, Dot, Fact, Footer, GoldButton, Greeting, LeadPoster, largePoster, Note, Pad, PosterRow, SheetHeading, SheetTitle, Shell, Signoff } from './theme';

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
const short = (ts: number, tz: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).format(ts).replace('Sept', 'Sep');

export function leavingSubject(items: LeavingContent['items']): string {
  return items.length === 1 ? `${items[0]!.title} is leaving soon` : `${items.length} things you watched are leaving soon`;
}

/** Last showings: the title leaving first is the one-sheet, its date the gold line; the rest as dated rows. */
export function LeavingEmail(p: LeavingEmailProps) {
  const items = [...p.items].sort((a, b) => a.removeAt - b.removeAt);
  const [lead, ...rest] = items;
  if (!lead) return null;
  return (
    <Shell preview={`Watch ${items.length === 1 ? 'it' : 'them'} before ${day(lead.removeAt, p.tz)}.`}>
      {lead.image && <LeadPoster src={p.image(largePoster(lead.image))} alt={lead.title} />}
      <Pad>
        <SheetTitle>{lead.title}</SheetTitle>
        <Billing
          lines={[
            <>
              Last showings on <Fact>{p.serverName}</Fact>
            </>,
            <>
              Leaving <Fact>{day(lead.removeAt, p.tz)}</Fact>
              {rest.length > 0 && (
                <>
                  <Dot />
                  Plus <Fact>{rest.length === 1 ? '1 more you watched' : `${rest.length} more you watched`}</Fact>
                </>
              )}
            </>,
          ]}
        />
      </Pad>
      <DateLine>{`Leaving ${short(lead.removeAt, p.tz)}`}</DateLine>
      <Pad>
        <Greeting name={p.recipientName}>
          <Note>
            To make room on {p.serverName}, {items.length === 1 ? 'something you watched is' : 'a few things you watched are'} leaving soon. If you want to finish or rewatch, now's the time.
          </Note>
        </Greeting>
        <GoldButton href={p.links.plex}>Watch in Plex</GoldButton>
        {rest.length > 0 && (
          <>
            <SheetHeading>Also leaving</SheetHeading>
            {rest.map((it, i) => (
              <PosterRow key={it.key} first={i === 0} src={it.image ? p.image(it.image) : null} title={it.title} right={short(it.removeAt, p.tz)} />
            ))}
          </>
        )}
        <Signoff greeting="Cheers," signature={p.signature} />
      </Pad>
      <Footer
        reason="You get these for things you've watched."
        links={[
          { label: 'Choose what you get', href: p.links.preferences },
          { label: 'Stop these', href: p.links.unsubscribe },
        ]}
      />
    </Shell>
  );
}
