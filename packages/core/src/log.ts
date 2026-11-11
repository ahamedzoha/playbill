import { config, type LogLevel } from './config';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Redacts anything that looks like a credential before it reaches stdout. */
export function redact(text: string): string {
  return text
    .replace(/(X-Plex-Token=|apikey=|api_key=|token=)[^&\s"']+/gi, '$1***')
    .replace(/("?(?:authToken|apiKey|api_key|password|secret|token)"?\s*[:=]\s*")[^"]+/gi, '$1***');
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
}

/** One-line logs: `2026-11-11T10:00:00.000Z info  [worker] message {"k":"v"}`. */
export function logger(scope: string): Logger {
  const write = (level: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[config().logLevel]) return;
    const tail = extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
    const line = redact(`${new Date().toISOString()} ${level.padEnd(5)} [${scope}] ${msg}${tail}`);
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(`${line}\n`);
  };
  return {
    debug: (m, e) => write('debug', m, e),
    info: (m, e) => write('info', m, e),
    warn: (m, e) => write('warn', m, e),
    error: (m, e) => write('error', m, e),
  };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
