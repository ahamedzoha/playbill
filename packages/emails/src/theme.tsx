/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Body, Container, Head, Html, Img, Link, Preview, Section, Text } from '@react-email/components';
import type { CSSProperties, ReactNode } from 'react';
import type { ImageRef } from '@playbill/core/links';

/**
 * The One-Sheet: every Playbill email is printed like a cinema poster's billing. Ink-black field,
 * paper-white type, billing grey for credits, one gold for dates and the button. Narrow condensed
 * caps for billing, headings and dates; a plain sans for the owner's own words. Hairline rules,
 * no cards.
 *
 * Email-safe: tables via React Email, inline styles, bgcolor attributes for Outlook, system fonts
 * only (a web font would tell a font host every time someone opens the email).
 */
export const C = {
  ink: '#0c0c0e',
  paper: '#f1ede4',
  note: '#d9d4c9',
  bill: '#8f8a80',
  link: '#b3ada0',
  rule: '#2a2a2e',
  ruleStrong: '#4a4740',
  well: '#1c1c20',
  gold: '#e0b04a',
} as const;

export const FONT = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif";
/** Condensed caps: Helvetica Neue's condensed cuts on Apple devices, Arial Narrow on Windows, Roboto Condensed on Android. */
export const NARROW = "'HelveticaNeue-CondensedBold', 'Helvetica Neue Condensed', 'Arial Narrow', 'Roboto Condensed', 'sans-serif-condensed', 'Helvetica Neue', Arial, sans-serif";
export const NARROW_HEAVY = "'HelveticaNeue-CondensedBlack', 'HelveticaNeue-CondensedBold', 'Helvetica Neue Condensed', 'Arial Narrow', 'Roboto Condensed', 'sans-serif-condensed', 'Helvetica Neue', Arial, sans-serif";

export const caps = (size: number, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: NARROW,
  fontStretch: 'condensed',
  fontSize: `${size}px`,
  fontWeight: 700,
  textTransform: 'uppercase',
  ...extra,
});

export function firstName(name: string): string {
  const n = name.trim().split(/\s+/)[0] ?? '';
  return n && n !== 'there' ? n : 'there';
}

/** The lead poster: the proxy crops it to 4:5 and fades it into the ink (`fx: 'lead'`). */
export function largePoster(ref: ImageRef): ImageRef {
  if (ref.k === 'plex') return { ...ref, w: 880, h: 1100, fx: 'lead' };
  return { k: 'url', u: ref.u.replace(/\/w(92|154|185|342|500)\//, '/w780/'), fx: 'lead' };
}

/** A poster asked for at a given size (Plex resizes exactly; remote posters come as they are). */
export function sizedPoster(ref: ImageRef, w: number, h: number): ImageRef {
  return ref.k === 'plex' ? { ...ref, w, h } : ref;
}

/** The frame every email shares: ink field edge to edge, a 600px column, no outer card. */
export function Shell({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head>
        {/* Designed dark: clients that respect this leave the colours alone instead of inverting them. */}
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: C.ink, fontFamily: FONT, color: C.paper, WebkitFontSmoothing: 'antialiased' }}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} {...{ bgcolor: C.ink }} style={{ backgroundColor: C.ink }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: 0 }}>
                {/* Outlook ignores max-width; index.ts swaps these markers for a 600px conditional table. */}
                <div data-pb-mso="open" />
                <Container style={{ width: '100%', maxWidth: '600px', margin: '0 auto', backgroundColor: C.ink }}>{children}</Container>
                <div data-pb-mso="close" />
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}

/** Side padding for everything below the poster. */
export function Pad({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <Section style={{ padding: '0 22px', ...style }}>{children}</Section>;
}

/** The lead poster: full width on a phone, a 440px one-sheet centred on a desktop, fading into the ink. */
export function LeadPoster({ src, alt }: { src: string; alt: string }) {
  return (
    <Section style={{ textAlign: 'center' }}>
      <Img src={src} width={440} height={550} alt={alt} style={{ display: 'block', margin: '0 auto', width: '100%', maxWidth: '440px', height: 'auto', backgroundColor: C.well, border: 0 }} />
    </Section>
  );
}

/** The one-sheet's title: condensed black caps, sized down for long titles so they wrap at most three lines. */
export function SheetTitle({ children }: { children: string }) {
  const n = children.length;
  const size = n <= 12 ? 56 : n <= 20 ? 46 : n <= 32 ? 36 : 30;
  return (
    <Text
      style={{
        margin: '26px 0 0',
        fontFamily: NARROW_HEAVY,
        fontStretch: 'condensed',
        fontSize: `${size}px`,
        lineHeight: `${Math.round(size * 0.98)}px`,
        fontWeight: 900,
        letterSpacing: '0.01em',
        textTransform: 'uppercase',
        textAlign: 'center',
        textWrap: 'balance',
        color: C.paper,
      }}
    >
      {children}
    </Text>
  );
}

/** The billing block: dense centred credits in narrow grey caps, facts picked out in paper white. */
export function Billing({ lines }: { lines: ReactNode[] }) {
  return (
    <Text style={{ ...caps(11, { letterSpacing: '0.06em', lineHeight: '17px', color: C.bill, textAlign: 'center' }), margin: '12px auto 0', maxWidth: '380px' }}>
      {lines.map((l, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {l}
        </span>
      ))}
    </Text>
  );
}

export const Fact = ({ children }: { children: ReactNode }) => <span style={{ color: C.paper }}>{children}</span>;
export const Dot = () => <span style={{ padding: '0 6px' }}>·</span>;

/** The release line: one gold statement under the billing, between hairlines. */
export function DateLine({ children }: { children: string }) {
  // One line on a phone wherever possible: a 28px line holds about 20 condensed caps in 346px.
  const size = children.length <= 20 ? 28 : children.length <= 26 ? 23 : 20;
  return (
    <Section style={{ padding: '0 22px', marginTop: '22px' }}>
      <Text
        style={{
          margin: 0,
          padding: '16px 0 0',
          borderTop: `1px solid ${C.ruleStrong}`,
          fontFamily: NARROW_HEAVY,
          fontStretch: 'condensed',
          fontSize: `${size}px`,
          lineHeight: `${size + 4}px`,
          fontWeight: 900,
          letterSpacing: '0.07em',
          textWrap: 'balance',
          textTransform: 'uppercase',
          textAlign: 'center',
          color: C.gold,
        }}
      >
        {children}
      </Text>
    </Section>
  );
}

export function Greeting({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <Text style={{ margin: '26px 0 0', fontSize: '24px', lineHeight: '30px', fontWeight: 700, letterSpacing: '-0.02em', color: C.paper }}>Hey {firstName(name)},</Text>
      {children}
    </>
  );
}

export function Note({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <Text style={{ margin: '10px 0 0', fontSize: '16px', lineHeight: '25px', color: C.note, ...style }}>{children}</Text>;
}

/**
 * Full-width gold button, bulletproof: the gold is the table cell's (bgcolor too, for Outlook), and
 * the link fills it, so a client that drops link padding still shows a full-size button.
 */
export function GoldButton({ href, children }: { href: string; children: string }) {
  return (
    <Section style={{ marginTop: '22px' }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tbody>
          <tr>
            <td align="center" {...{ bgcolor: C.gold }} style={{ backgroundColor: C.gold, msoPaddingAlt: '16px 12px' } as CSSProperties}>
              <Link
                href={href}
                style={{
                  display: 'block',
                  color: C.ink,
                  textAlign: 'center',
                  padding: '16px 12px',
                  ...caps(17, { fontFamily: NARROW_HEAVY, fontWeight: 900, letterSpacing: '0.2em', lineHeight: '20px' }),
                  textDecoration: 'none',
                }}
              >
                {children}
              </Link>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/** Section heading: small wide-tracked grey caps over a hairline. */
export function SheetHeading({ children }: { children: string }) {
  return <Text style={{ ...caps(12, { letterSpacing: '0.26em', lineHeight: '16px', color: C.bill }), margin: '40px 0 14px', padding: '9px 0 0', borderTop: `1px solid ${C.ruleStrong}` }}>{children}</Text>;
}

export function Signoff({ greeting, signature }: { greeting: string; signature: string }) {
  return (
    <Text style={{ margin: '30px 0 0', fontSize: '16px', lineHeight: '25px', color: C.note }}>
      {greeting}
      <br />
      <strong style={{ color: C.paper }}>{signature}</strong>
    </Text>
  );
}

export function Footer({ reason, links }: { reason: string; links: { label: string; href: string }[] }) {
  const a = { color: C.link, textDecoration: 'underline' };
  return (
    <Section style={{ padding: '0 22px 36px' }}>
      <Text style={{ margin: '44px 0 0', padding: '18px 0 0', borderTop: `1px solid ${C.rule}`, fontSize: '12px', lineHeight: '19px', color: C.bill, textAlign: 'center' }}>
        {reason}{' '}
        {links.map((l, i) => (
          <span key={l.label} style={{ whiteSpace: 'nowrap' }}>
            {i > 0 && ' · '}
            <Link href={l.href} style={a}>
              {l.label}
            </Link>
          </span>
        ))}
      </Text>
      <Text style={{ margin: '8px 0 0', fontSize: '11px', lineHeight: '16px', color: C.bill, textAlign: 'center' }}>Sent with Playbill</Text>
    </Section>
  );
}

/** A small one-sheet beside its billing: poster, title in caps, a grey detail, an optional gold date on the right. */
export function PosterRow({ src, title, detail, right, first }: { src: string | null; title: string; detail?: string | null; right?: string | null; first?: boolean }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ borderTop: first ? 'none' : `1px solid ${C.rule}` }}>
      <tbody>
        <tr>
          <td width={60} style={{ width: '60px', padding: '12px 0', verticalAlign: 'middle' }}>
            {src ? <Img src={src} width={48} height={72} alt="" style={{ display: 'block', backgroundColor: C.well, border: 0 }} /> : <div style={{ width: 48, height: 72, backgroundColor: C.well }} />}
          </td>
          <td style={{ padding: '12px 12px 12px 4px', verticalAlign: 'middle' }}>
            <Text style={{ ...caps(15, { letterSpacing: '0.05em', lineHeight: '19px', color: C.paper }), margin: 0 }}>{title}</Text>
            {detail && <Text style={{ ...caps(11, { letterSpacing: '0.06em', lineHeight: '15px', color: C.bill }), margin: '3px 0 0' }}>{detail}</Text>}
          </td>
          {right && (
            <td align="right" style={{ padding: '12px 0', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
              <Text style={{ ...caps(14, { fontFamily: NARROW_HEAVY, fontWeight: 900, letterSpacing: '0.06em', lineHeight: '18px', color: C.gold, textAlign: 'right' }), margin: 0 }}>{right}</Text>
            </td>
          )}
        </tr>
      </tbody>
    </table>
  );
}
