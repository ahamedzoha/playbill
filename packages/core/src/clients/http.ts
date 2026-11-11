import { redact } from '../log';

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly url: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  query?: Record<string, string | number | boolean | undefined>;
}

export function withQuery(url: string, query?: RequestOptions['query']): string {
  if (!query) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) u.searchParams.set(k, String(v));
  return u.toString();
}

/** fetch + JSON with a timeout, and errors that never echo credentials. */
export async function requestJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const full = withQuery(url, opts.query);
  const safeUrl = redact(full);
  let res: Response;
  try {
    res = await fetch(full, {
      method: opts.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : err instanceof Error ? err.message : String(err);
    throw new HttpError(`Could not reach ${safeUrl}: ${reason}`, null, safeUrl);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(`${res.status} ${res.statusText} from ${safeUrl}${text ? `: ${redact(text.slice(0, 200))}` : ''}`, res.status, safeUrl);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Strips trailing slashes so `${base}/path` never doubles up. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
