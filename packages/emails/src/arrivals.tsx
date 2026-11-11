/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ArrivalItem } from '@playbill/core/arrivals';
import type { ImageRef } from '@playbill/core/links';
import { Billing, DateLine, Dot, Fact, Footer, GoldButton, Greeting, LeadPoster, largePoster, Note, Pad, PosterRow, SheetHeading, SheetTitle, Shell, Signoff } from './theme';

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

const why = (it: ArrivalItem) => (it.kind === 'show' && !it.newSeries ? `${it.detail} · you've been watching this` : it.detail);

/** "It's here": the first arrival printed as the one-sheet, any others as small one-sheets below. */
export function ArrivalsEmail(p: ArrivalsEmailProps) {
  const follows = p.items.some((i) => i.kind === 'show' && !i.newSeries);
  const [lead, ...rest] = p.items;
  if (!lead) return null;
  return (
    <Shell preview={p.items.map((i) => i.title).join(', ')}>
      {lead.image && <LeadPoster src={p.image(largePoster(lead.image))} alt={lead.title} />}
      <Pad>
        <SheetTitle>{lead.title}</SheetTitle>
        <Billing
          lines={[
            <>
              <Fact>{p.serverName}</Fact> presents<Dot />
              {lead.detail}
            </>,
            ...(lead.kind === 'show' && !lead.newSeries ? [<>A show you've been watching</>] : []),
            ...(rest.length > 0 ? [<>Also arriving: {rest.map((r, i) => <span key={r.key}>{i > 0 && <Dot />}{r.title}</span>)}</>] : []),
          ]}
        />
      </Pad>
      <DateLine>Ready to watch</DateLine>
      <Pad>
        <Greeting name={p.recipientName}>
          <Note>
            {p.items.length === 1 ? 'Something you might like' : 'A few things you might like'} just landed on {p.serverName}.
          </Note>
        </Greeting>
        <GoldButton href={p.links.plex}>Watch in Plex</GoldButton>
        {rest.length > 0 && (
          <>
            <SheetHeading>Also just in</SheetHeading>
            {rest.map((it, i) => (
              <PosterRow key={it.key} first={i === 0} src={it.image ? p.image(it.image) : null} title={it.title} detail={why(it)} />
            ))}
          </>
        )}
        <Signoff greeting="Enjoy," signature={p.signature} />
      </Pad>
      <Footer
        reason={follows ? 'You get these for shows you watch and new films.' : 'You get these when new films and series arrive.'}
        links={[
          { label: 'Choose what you get', href: p.links.preferences },
          { label: 'Stop these', href: p.links.unsubscribe },
        ]}
      />
    </Shell>
  );
}
