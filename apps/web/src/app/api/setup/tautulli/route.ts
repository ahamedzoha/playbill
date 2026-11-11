import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { audit } from '@playbill/core/audit';
import { TautulliClient } from '@playbill/core/clients/tautulli';
import { saveIntegration } from '@playbill/core/integrations';
import { getSetting } from '@playbill/core/settings';
import { advanceSetup } from '@playbill/core/setup';
import { currentOwner, db, handle, jsonError } from '@/lib/server';

const body = z.object({
  url: z.string().url(),
  apiKey: z.string().min(8),
});

/**
 * Tests Tautulli and checks it watches the same Plex server Playbill was pointed at,
 * then saves it. Tautulli is the last required step, so this finishes setup.
 */
export const POST = handle(async (req: NextRequest) => {
  const owner = await currentOwner();
  if (!owner) return jsonError(403, 'Only the server owner can do this.');
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Enter the Tautulli address and its API key (Settings → Web Interface → API).');
  const d = db();
  const plex = getSetting(d, 'plex');
  if (!plex) return jsonError(409, 'Choose your Plex server first.');

  let info: Awaited<ReturnType<TautulliClient['info']>>;
  try {
    info = await new TautulliClient(parsed.data.url, parsed.data.apiKey).info();
  } catch (err) {
    return jsonError(502, `Tautulli didn't answer: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (info.pmsIdentifier && info.pmsIdentifier !== plex.machineId) {
    return jsonError(
      409,
      `This Tautulli watches "${info.pmsName ?? 'another server'}", not "${plex.name}". Point Playbill at the Tautulli for ${plex.name}.`,
    );
  }

  const message = `Tautulli ${info.version}`;
  saveIntegration(d, { kind: 'tautulli', name: 'Tautulli', baseUrl: parsed.data.url, apiKey: parsed.data.apiKey }, { ok: true, message });
  advanceSetup(d, 4, true);
  audit(d, { actor: owner.username, action: 'setup.tautulli', after: { url: parsed.data.url, version: info.version } });
  return NextResponse.json({ ok: true, version: info.version });
});
