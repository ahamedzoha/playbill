import { z } from 'zod';
import { crypto } from '@playbill/core/crypto';
import { getDb } from '@playbill/core/db';
import { saveIntegration, testIntegration } from '@playbill/core/integrations';
import { DEFAULT_LIMITS } from '@playbill/core/quota';
import { getSetting, setSetting } from '@playbill/core/settings';

/**
 * Headless configuration, for scripted installs:
 *   echo '{"kind":"sonarr","url":"http://sonarr:8989","apiKey":"…"}' | docker exec -i playbill node /app/worker/dist/worker.mjs config integration
 *   echo '{"provider":"resend","fromName":"My Plex","fromAddress":"plex@example.com","secret":"re_…"}' | … config email
 *   echo '{"publicUrl":"https://playbill.example.com","timezone":"Europe/London"}' | … config general
 * Input comes on stdin so secrets never appear in the process list or shell history.
 */

async function stdinJson(): Promise<unknown> {
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  return JSON.parse(s);
}

const integration = z.object({ kind: z.enum(['tautulli', 'seerr', 'sonarr', 'radarr']), url: z.string().url(), apiKey: z.string().min(8), name: z.string().optional() });
const email = z.object({
  provider: z.enum(['resend', 'smtp']),
  fromName: z.string().min(1),
  fromAddress: z.string().email(),
  replyTo: z.string().email().nullable().optional(),
  secret: z.string().min(1),
  smtp: z.object({ host: z.string(), port: z.number().int(), secure: z.boolean(), user: z.string().nullable() }).nullable().optional(),
  perDay: z.number().int().min(1).optional(),
  perMonth: z.number().int().min(1).optional(),
});
const general = z.object({ publicUrl: z.string().url().nullable().optional(), timezone: z.string().optional() });

export async function runCli(args: string[]): Promise<void> {
  const [cmd, what] = args;
  if (cmd !== 'config' || !what) throw new Error('Usage: worker.mjs config <integration|email|general> < settings.json');
  const db = getDb();
  const input = await stdinJson();
  if (what === 'integration') {
    const v = integration.parse(input);
    const message = await testIntegration(v.kind, v.url, v.apiKey);
    const name = v.name ?? { tautulli: 'Tautulli', seerr: 'Seerr', sonarr: 'Sonarr', radarr: 'Radarr' }[v.kind];
    saveIntegration(db, { kind: v.kind, name, baseUrl: v.url, apiKey: v.apiKey }, { ok: true, message });
    console.log(`saved ${v.kind}: ${message}`);
  } else if (what === 'email') {
    const v = email.parse(input);
    setSetting(db, 'email', {
      provider: v.provider,
      fromName: v.fromName,
      fromAddress: v.fromAddress,
      replyTo: v.replyTo ?? null,
      smtp: v.provider === 'smtp' ? (v.smtp ?? null) : null,
      secretEnc: crypto().encrypt(v.secret),
      limits: { perDay: v.perDay ?? DEFAULT_LIMITS.perDay, perMonth: v.perMonth ?? DEFAULT_LIMITS.perMonth },
    });
    console.log(`saved email: ${v.provider} from ${v.fromAddress}`);
  } else if (what === 'general') {
    const v = general.parse(input);
    const cur = getSetting(db, 'general');
    setSetting(db, 'general', {
      publicUrl: v.publicUrl === undefined ? (cur?.publicUrl ?? null) : v.publicUrl,
      timezone: v.timezone ?? cur?.timezone ?? process.env.TZ ?? 'UTC',
      serverName: cur?.serverName ?? getSetting(db, 'plex')?.name ?? 'Plex',
    });
    console.log('saved general settings');
  } else {
    throw new Error(`Unknown config section "${what}"`);
  }
}
