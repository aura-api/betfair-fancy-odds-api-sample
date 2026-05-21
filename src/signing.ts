import { createHash, createHmac } from 'node:crypto';

/**
 * Compute SHA-256 of a UTF-8 string, returned as lowercase hex.
 */
export function sha256HexUtf8(s: string): string {
  return createHash('sha256').update(s ?? '', 'utf8').digest('hex');
}

/**
 * Compute HMAC-SHA256 with a UTF-8 key and payload, returned as lowercase hex.
 */
export function hmacSha256HexUtf8(secret: string, payload: string): string {
  return createHmac('sha256', secret ?? '')
    .update(payload ?? '', 'utf8')
    .digest('hex');
}

/**
 * Build the canonical string to sign: METHOD\nPATH\nTIMESTAMP\nBODY_HASH
 * `path` must be URL path only (no query string), starting with `/`.
 */
export function buildStringToSign(
  method: string,
  path: string,
  timestampMs: string,
  rawBody: string,
): string {
  const bodyHash = sha256HexUtf8(rawBody ?? '');
  return `${method}\n${path}\n${timestampMs}\n${bodyHash}`;
}

export interface SignedHeaders {
  'X-Api-Key': string;
  'X-Timestamp': string;
  'X-Signature': string;
}

/**
 * Produces auth headers for one HTTP request. Use the **exact same** `rawBody` bytes
 * you place in the request body (the server hashes the raw stream before JSON binding).
 */
export function signBfGatewayRequest(
  method: string,
  path: string,
  rawBody: string,
  apiKey: string,
  sharedSecret: string,
  timestampMs: string = Date.now().toString(),
): SignedHeaders {
  const stringToSign = buildStringToSign(method, path, timestampMs, rawBody);
  const signature = hmacSha256HexUtf8(sharedSecret, stringToSign);
  return {
    'X-Api-Key': apiKey,
    'X-Timestamp': timestampMs,
    'X-Signature': signature,
  };
}
