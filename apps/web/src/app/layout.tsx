import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Hanken_Grotesk } from 'next/font/google';
import Script from 'next/script';
import type { ReactNode } from 'react';
import './globals.css';

// Self-hosted at build time by next/font: no request to Google from the browser.
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const heads = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-heads', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Playbill', template: '%s · Playbill' },
  description: 'Newsletters, new-arrival alerts and user management for your Plex server.',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1b2c57' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1a34' },
  ],
};

// Applies a saved light/dark choice before first paint, so the page never flashes the other theme.
const themeScript = `try{var t=localStorage.getItem('playbill-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${heads.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans antialiased">
        <Script id="playbill-theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
