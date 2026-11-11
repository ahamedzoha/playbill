/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Section } from '@react-email/components';
import type { PersonRecap } from '@playbill/core/recap';
import type { ImageRef } from '@playbill/core/links';
import { Billing, C, DateLine, Dot, Fact, Footer, GoldButton, Greeting, Note, Pad, PosterRow, SheetHeading, SheetTitle, Shell, Signoff } from './theme';

const DAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

export interface RecapEmailProps {
  recap: PersonRecap;
  monthLabel: string;
  serverName: string;
  signature: string;
  image: (ref: ImageRef) => string;
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

/** A personal month printed as its own one-sheet: the month is the title, the hours the gold line. */
export function RecapEmail(p: RecapEmailProps) {
  const r = p.recap;
  const month = p.monthLabel.split(' ')[0] ?? p.monthLabel;
  const vs = change(r.hours, r.previousHours);
  return (
    <Shell preview={`${hoursText(r.hours)} across ${r.activeDays} ${r.activeDays === 1 ? 'day' : 'days'}${r.top[0] ? `, mostly ${r.top[0].title}` : ''}.`}>
      <Section style={{ height: '34px', backgroundColor: C.ink }} />
      <Pad>
        <SheetTitle>{`Your ${month}`}</SheetTitle>
        <Billing
          lines={[
            <>
              <Fact>{p.serverName}</Fact> presents<Dot />
              {p.monthLabel}
            </>,
            <>
              <Fact>{r.plays.toLocaleString('en')}</Fact> {r.plays === 1 ? 'play' : 'plays'}
              <Dot />
              <Fact>{r.activeDays}</Fact> {r.activeDays === 1 ? 'day' : 'days'}
              {r.top[0] && (
                <>
                  <Dot />
                  Starring <Fact>{r.top[0].title}</Fact>
                </>
              )}
            </>,
          ]}
        />
      </Pad>
      <DateLine>{`${hoursText(r.hours)} watched`}</DateLine>
      <Pad>
        <Greeting name={r.name}>
          <Note>
            That's {r.plays} {r.plays === 1 ? 'play' : 'plays'} across {r.activeDays} {r.activeDays === 1 ? 'day' : 'days'}
            {vs ? `, ${vs}` : ''}.{r.favouriteDay !== null ? ` ${DAYS[r.favouriteDay]} were your big nights.` : ''}
          </Note>
          {r.unfinished.length > 0 && <Note style={{ margin: '12px 0 0' }}>Still to finish: {r.unfinished.map((u) => `${u.title} (${u.percent}% in)`).join(' and ')}.</Note>}
        </Greeting>
        <GoldButton href={p.links.plex}>Keep watching</GoldButton>
        {r.top.length > 0 && (
          <>
            <SheetHeading>What you watched most</SheetHeading>
            {r.top.map((t, i) => (
              <PosterRow key={t.title} first={i === 0} src={t.image ? p.image(t.image) : null} title={t.title} right={hoursText(t.hours)} />
            ))}
          </>
        )}
        <Signoff greeting="Thanks for watching," signature={p.signature} />
      </Pad>
      <Footer
        reason="Only you get this; nobody else sees your numbers."
        links={[
          { label: 'Choose what you get', href: p.links.preferences },
          { label: 'Stop recaps', href: p.links.unsubscribe },
        ]}
      />
    </Shell>
  );
}
