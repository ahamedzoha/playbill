/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Column, Img, Link, Row, Text } from '@react-email/components';
import type { DigestContent, DigestItem } from '@playbill/core/digest';
import type { ImageRef } from '@playbill/core/links';
import { Billing, C, caps, DateLine, Dot, Fact, Footer, GoldButton, Greeting, LeadPoster, largePoster, Note, Pad, PosterRow, SheetHeading, SheetTitle, Shell, Signoff, sizedPoster } from './theme';

/**
 * The weekly digest, printed as a one-sheet: the week's headline title as the poster with the
 * server's name in its billing block, then the rest of the week as small one-sheets and date lines.
 */

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

function fmtDay(ts: number, tz: string, withWeekday = false): string {
  return new Intl.DateTimeFormat('en-GB', { ...(withWeekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'short', timeZone: tz })
    .format(ts)
    .replace('Sept', 'Sep');
}

const yearOf = (it: DigestItem): number | null => (it.detail && /^\d{4}$/.test(it.detail) ? Number(it.detail) : null);
const isFilm = (it: DigestItem) => !it.detail || yearOf(it) !== null;
/** Short enough for a 110px column on a phone: "2026", "6 new episodes", "New series". */
const sheetDetail = (it: DigestItem): string | null => it.detail;

/**
 * The headline: the newest release among titles that have a poster (a 2026 film beats a 1993 one;
 * films with a year beat series), keeping the most recently added on a tie.
 */
export function headlineIndex(items: DigestItem[]): number {
  let best = -1;
  let bestYear = -Infinity;
  items.forEach((it, i) => {
    if (!it.image) return;
    const y = yearOf(it) ?? -1;
    if (y > bestYear) {
      best = i;
      bestYear = y;
    }
  });
  return best;
}

export function digestPreheader(c: DigestContent): string {
  const parts: string[] = [];
  const films = c.added.filter(isFilm).length;
  const shows = c.added.length - films;
  if (films) parts.push(`${films} new ${films === 1 ? 'film' : 'films'}`);
  if (shows) parts.push(`${shows} ${shows === 1 ? 'show' : 'shows'} with new episodes`);
  if (c.coming.length) parts.push(`${c.coming.length} coming up`);
  return parts.length ? `${parts.join(', ')}.` : 'A quiet week on the server.';
}

function GridPoster({ it, image, w }: { it: DigestItem; image: DigestEmailProps['image']; w: number }) {
  const h = Math.round(w * 1.5);
  return it.image ? (
    <Img src={image(sizedPoster(it.image, w * 2, h * 2))} width={w} height={h} alt="" style={{ display: 'block', width: '100%', maxWidth: `${w}px`, height: 'auto', backgroundColor: C.well, border: 0 }} />
  ) : (
    <div style={{ width: '100%', maxWidth: `${w}px`, height: 0, paddingBottom: '150%', backgroundColor: C.well }} />
  );
}

function GridCaption({ it, big }: { it: DigestItem; big: boolean }) {
  return (
    <>
      <Text style={{ ...caps(big ? 14 : 12.5, { letterSpacing: '0.04em', lineHeight: big ? '18px' : '16px', color: C.paper }), margin: '9px 0 0' }}>{it.title}</Text>
      {sheetDetail(it) && <Text style={{ ...caps(big ? 12 : 11.5, { letterSpacing: '0.06em', lineHeight: '15px', color: C.bill }), margin: '2px 0 0' }}>{sheetDetail(it)}</Text>}
    </>
  );
}

/**
 * The rest of the week in two tiers: the next two titles as larger one-sheets side by side, then
 * small ones three to a row. Posters shrink to their column on phones and stop at their size on
 * desktop; gaps are split so every poster in a row is the same width.
 */
function SheetGrid({ items, image }: { items: DigestItem[]; image: DigestEmailProps['image'] }) {
  const feature = items.length >= 2 ? items.slice(0, 2) : [];
  const small = items.slice(feature.length);
  const rows: DigestItem[][] = [];
  for (let i = 0; i < small.length; i += 3) rows.push(small.slice(i, i + 3));
  return (
    <>
      {feature.length > 0 && (
        <Row style={{ marginBottom: '22px' }}>
          {feature.map((it, j) => (
            <Column key={j} style={{ width: '50%', verticalAlign: 'top', padding: j === 0 ? '0 7px 0 0' : '0 0 0 7px' }}>
              <GridPoster it={it} image={image} w={260} />
              <GridCaption it={it} big />
            </Column>
          ))}
        </Row>
      )}
      {rows.map((row, i) => (
        <Row key={i} style={{ marginBottom: '18px' }}>
          {[0, 1, 2].map((j) => {
            const it = row[j];
            return (
              // Two 12px gaps shared so every column loses 8px and the posters stay the same size.
              <Column key={j} style={{ width: '33.33%', verticalAlign: 'top', padding: ['0 8px 0 0', '0 4px', '0 0 0 8px'][j] }}>
                {it && (
                  <>
                    <GridPoster it={it} image={image} w={160} />
                    <GridCaption it={it} big={false} />
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

export function DigestEmail(p: DigestEmailProps) {
  const c = p.content;
  const range = `${fmtDay(c.windowStart, p.tz)} – ${fmtDay(c.windowEnd - 1, p.tz)}`;
  const h = headlineIndex(c.added);
  const lead = h >= 0 ? c.added[h]! : (c.added[0] ?? null);
  const rest = lead ? c.added.filter((it) => it !== lead) : [];
  const more = rest.length + c.addedOther;

  const leadLine = lead ? (isFilm(lead) ? (yearOf(lead) ? `A ${yearOf(lead)} film` : 'A film') : lead.detail === 'New series' ? 'A new series' : `A series · ${lead.detail}`) : null;
  const billing = lead
    ? [
        <>
          <Fact>{p.serverName}</Fact> presents<Dot />
          {leadLine}
        </>,
        <>
          Added <Fact>{range}</Fact>
          {more > 0 && (
            <>
              <Dot />
              Plus <Fact>{more === 1 ? '1 more title' : `${more} more titles`}</Fact>
            </>
          )}
        </>,
        ...(rest.length > 0 ? [<>{rest.slice(0, 3).map((r, i) => <span key={i}>{i > 0 && <Dot />}{r.title}</span>)}</>] : []),
      ]
    : [
        <>
          <Fact>{p.serverName}</Fact>
          <Dot />
          {range}
        </>,
      ];

  return (
    <Shell preview={digestPreheader(c)}>
      {lead?.image && <LeadPoster src={p.image(largePoster(lead.image))} alt={lead.title} />}

      <Pad>
        <SheetTitle>{lead ? lead.title : 'A quiet week'}</SheetTitle>
        <Billing lines={billing} />
      </Pad>

      <DateLine>{lead ? 'Now on the server' : c.coming.length ? 'Coming soon' : 'Back next week'}</DateLine>

      <Pad>
        <Greeting name={p.recipientName}>
          <Note>
            {lead
              ? more > 0
                ? `${lead.title} leads the week on ${p.serverName}, with ${more} more behind it.`
                : `${lead.title} is new on ${p.serverName} this week.`
              : `Nothing new landed on ${p.serverName} this week${c.coming.length ? ", but here's what's on the way" : ''}.`}
          </Note>
          {p.intro.trim() &&
            p.intro
              .trim()
              .split(/\n{2,}/)
              .map((para, i) => (
                <Note key={i} style={{ margin: '12px 0 0' }}>
                  {para}
                </Note>
              ))}
        </Greeting>
        <GoldButton href={p.links.plex}>Open Plex</GoldButton>

        {rest.length > 0 && (
          <>
            <SheetHeading>Also new this week</SheetHeading>
            <SheetGrid items={rest} image={p.image} />
          </>
        )}
        {c.addedOther > 0 && (
          <Text style={{ margin: rest.length ? '0' : '18px 0 0', fontSize: '14px', lineHeight: '21px', color: C.bill }}>
            And {c.addedOther} more.{' '}
            <Link href={p.links.plex} style={{ color: C.link, textDecoration: 'underline' }}>
              See everything in Plex
            </Link>
          </Text>
        )}

        {c.coming.length > 0 && (
          <>
            {/* On a quiet week the gold line above already says Coming soon. */}
            {lead ? <SheetHeading>Coming soon</SheetHeading> : <div style={{ height: '28px' }} />}
            {c.coming.map((it, i) => (
              <PosterRow key={i} first={i === 0} src={it.image ? p.image(it.image) : null} title={it.title} detail={it.detail} right={fmtDay(it.at, p.tz)} />
            ))}
          </>
        )}

        {c.requests.length > 0 && (
          <>
            <SheetHeading>Requests that arrived</SheetHeading>
            {c.requests.map((it, i) => (
              <PosterRow key={i} first={i === 0} src={it.image ? p.image(it.image) : null} title={it.title} detail={it.detail} right="Arrived" />
            ))}
          </>
        )}

        {c.stats && c.stats.plays > 0 && (
          <Note style={{ margin: '34px 0 0', fontSize: '15px', lineHeight: '23px' }}>
            {c.stats.watchers} of us watched something this week: {c.stats.hours.toLocaleString('en')} {c.stats.hours === 1 ? 'hour' : 'hours'} across{' '}
            {c.stats.plays.toLocaleString('en')} {c.stats.plays === 1 ? 'play' : 'plays'}.{c.stats.topTitle ? ` Most watched: ${c.stats.topTitle}.` : ''}
          </Note>
        )}

        <Signoff greeting="Happy watching," signature={p.signature} />
      </Pad>

      <Footer
        reason={`You're getting this because ${p.serverName} shares its library with you.`}
        links={[
          { label: 'Choose what you get', href: p.links.preferences },
          { label: 'Unsubscribe', href: p.links.unsubscribe },
          { label: 'View in a browser', href: p.links.webView },
        ]}
      />
    </Shell>
  );
}
