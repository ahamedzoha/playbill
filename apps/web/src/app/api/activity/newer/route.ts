import { listActivity, newerCount } from '@playbill/core/activity';
import { readParams, toFilter } from '@/lib/activity-view';
import { currentOwner, db } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** How many events arrived after `since` for the Activity page's current filters. Polled by the page. */
export async function GET(req: Request) {
  if (!(await currentOwner())) return Response.json({ count: 0 }, { status: 401 });
  const url = new URL(req.url);
  const since = Number(url.searchParams.get('since'));
  if (!Number.isFinite(since)) return Response.json({ count: 0 });
  const p = readParams(Object.fromEntries(url.searchParams));
  const f = toFilter({ ...p, range: 'all', from: null, to: null }, Date.now());
  // Free text matches the event's sentence, which only the list query computes.
  const count = f.text ? listActivity(db(), { ...f, since: since + 1 }, { limit: 500 }).events.length : newerCount(db(), f, since);
  return Response.json({ count }, { headers: { 'Cache-Control': 'no-store' } });
}
