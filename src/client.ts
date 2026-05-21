import { signBfGatewayRequest } from './signing.js';

export interface BfGatewayClientConfig {
  /** API base URL, e.g. `https://your-host.example.com` (no trailing slash). */
  baseUrl: string;
  apiKey: string;
  sharedSecret: string;
}

/** Path under host, e.g. `/api/bf-gateway/listEventTypes` */
function resolveUrl(baseUrl: string, path: string): { href: string; pathname: string } {
  const base = baseUrl.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  const href = `${base}${p}`;
  const pathname = new URL(href).pathname;
  return { href, pathname };
}

/**
 * POST JSON to the Betfair gateway with HMAC headers.
 * The body is serialized once with `JSON.stringify` and that exact string is signed.
 */
export async function bfGatewayPostJson(
  cfg: BfGatewayClientConfig,
  path: string,
  body: unknown,
  options?: { signal?: AbortSignal },
): Promise<Response> {
  const method = 'POST';
  const rawBody = JSON.stringify(body);
  const { href, pathname } = resolveUrl(cfg.baseUrl, path);
  const auth = signBfGatewayRequest(method, pathname, rawBody, cfg.apiKey, cfg.sharedSecret);
  return fetch(href, {
    method,
    signal: options?.signal,
    headers: {
      'Content-Type': 'application/json',
      ...auth,
    },
    body: rawBody,
  });
}
