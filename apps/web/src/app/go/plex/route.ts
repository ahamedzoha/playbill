export const dynamic = 'force-static';

/**
 * "Open Plex" in emails points here, on the install's own domain, and redirects to the Plex web
 * app. Spam filters and Resend's checks look for links that don't share the sending domain; a
 * link on the server's own (sub)domain doesn't stand out. Public, fixed target: not an open redirect.
 */
export function GET() {
  return new Response(null, { status: 302, headers: { Location: 'https://app.plex.tv/desktop', 'Cache-Control': 'public, max-age=86400' } });
}
