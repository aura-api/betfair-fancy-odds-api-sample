# Aura Betfair API — TypeScript Reference Client

Minimal **Node.js + TypeScript** client for the [Aura Betfair API](./docs/guide.md). Demonstrates HMAC request signing, all five gateway endpoints, and MQTT odds streaming.

> **Full API documentation:** [`docs/guide.md`](./docs/guide.md)

## Quick Start

```bash
git clone https://github.com/aura-e-gaming/betfair-api-client.git
cd betfair-api-client
cp .env.example .env
# Edit .env with your credentials
pnpm install
pnpm start                       # listEventTypes (default)
pnpm start listMarketCatalogue   # browse markets
pnpm start listMarketBook        # get odds snapshot
pnpm start subscribeMarkets      # activate MQTT streaming
```

Requires **Node 18+** (uses native `fetch` and `node:crypto`).

## Credentials

Get your API key and shared secret from the Aura team. Set them in `.env`:

```env
BF_GATEWAY_BASE_URL=https://your-assigned-host.example.com
BF_API_KEY=your_api_key
BF_SHARED_SECRET=your_shared_secret
```

## Project Structure

| File | Purpose |
|------|---------|
| [`src/signing.ts`](./src/signing.ts) | SHA-256 + HMAC-SHA256 helpers — copy into your own app if you only need signing |
| [`src/client.ts`](./src/client.ts) | HTTP client with automatic request signing |
| [`src/main.ts`](./src/main.ts) | CLI tool covering all 5 API endpoints |
| [`docs/guide.md`](./docs/guide.md) | **Complete API documentation** — authentication, endpoints, MQTT, payload formats |

## Authentication (Summary)

Every request requires three headers: `X-Api-Key`, `X-Timestamp`, `X-Signature`.

The signature is computed as:

```
bodyHash    = hex(SHA256(requestBody))
stringToSign = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + bodyHash
signature   = hex(HMAC-SHA256(sharedSecret, stringToSign))
```

See [`docs/guide.md` → Section 3](./docs/guide.md#3-authentication) for the full algorithm, worked example, and common mistakes.

## Available Endpoints

| Command | Endpoint | Description |
|---------|----------|-------------|
| `listEventTypes` | `POST /api/bf-gateway/listEventTypes` | Discover sports |
| `listMarketTypes` | `POST /api/bf-gateway/listMarketTypes` | Market types for a sport |
| `listMarketCatalogue` | `POST /api/bf-gateway/listMarketCatalogue` | Browse markets with metadata |
| `listMarketBook` | `POST /api/bf-gateway/listMarketBook` | Current odds snapshot |
| `subscribeMarkets` | `POST /api/bf-gateway/subscribeMarkets` | Activate real-time MQTT streaming |

## Common Errors

| Code | Meaning |
|------|---------|
| `BF_AUTH007` | Invalid signature — body signed ≠ body sent, or wrong path/method |
| `BF_AUTH003` | Timestamp outside ±5 min — sync your clock |
| `BF_AUTH005` | IP not in allowlist — contact Aura team |
| `BF_AUTH006` | Missing permission for this endpoint |

## Documentation

The complete developer guide covers:
- Detailed authentication with worked examples
- All API endpoints with request/response samples
- Betfair filter syntax and common search patterns
- Real-time MQTT odds streaming (WIN, LINE/Fancy, Bookmaker payloads)
- Error codes, rate limits, and best practices

**Read it here:** [`docs/guide.md`](./docs/guide.md)

## Support

For API access, onboarding, and integration help:

**Telegram:** [@aura_e_gaming](https://t.me/aura_e_gaming)
