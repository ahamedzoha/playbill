import { isPreviewKind } from '@playbill/core/preview';
import { emptyPreview, renderPreview, withPreviewStrip } from '@/lib/preview';
import { currentOwner } from '@/lib/server';

export const dynamic = 'force-dynamic';

/**
 * Any email as one person would get it, built live (nothing is saved or sent).
 * `?email=digest|arrivals|recap|leaving|nudge|warning|goodbye&for=<plexUserId>`; digest by default.
 */
export async function GET(req: Request) {
  if (!(await currentOwner())) return new Response('Sign in first', { status: 401 });
  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  const kind = isPreviewKind(email) ? email : 'digest';
  let html: string;
  try {
    const out = await renderPreview(kind, url.searchParams.get('for'), url.origin);
    html = 'empty' in out ? emptyPreview(out.empty) : withPreviewStrip(out.html, out.subject, out.note);
  } catch (err) {
    html = emptyPreview(`This preview couldn't be built: ${err instanceof Error ? err.message : String(err)}`);
  }
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
