import { resolve } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  /** Everything Playbill writes lives here: database, secret key, backups, image cache. */
  configDir: string;
  dbPath: string;
  port: number;
  /** Optional override for the key that encrypts stored API keys. Otherwise generated into configDir. */
  secretKey: string | null;
  logLevel: LogLevel;
  demoMode: boolean;
  /** Release version (semver) when built from a tag, else empty. */
  version: string;
  /** Git commit the build came from. Reported by /api/health so deploys can be verified. */
  revision: string;
}

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function flag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const configDir = resolve(env.CONFIG_DIR ?? (env.NODE_ENV === 'production' ? '/config' : './data'));
  const level = (env.LOG_LEVEL ?? 'info').toLowerCase() as LogLevel;
  return {
    configDir,
    dbPath: resolve(configDir, 'playbill.db'),
    port: Number(env.PORT ?? 5056),
    secretKey: env.PLAYBILL_SECRET_KEY?.trim() || null,
    logLevel: LEVELS.includes(level) ? level : 'info',
    demoMode: flag(env.DEMO_MODE),
    version: env.APP_VERSION ?? '',
    revision: env.APP_REVISION ?? 'dev',
  };
}

let cached: AppConfig | null = null;

/** Process-wide config, read once. */
export function config(): AppConfig {
  cached ??= loadConfig();
  return cached;
}
