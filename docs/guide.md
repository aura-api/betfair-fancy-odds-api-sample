# Aura Betfair API — Developer Guide

> **Version:** 1.0 | **Last updated:** May 2026

Welcome to the **Aura Betfair API**. This guide walks you through everything you need to integrate real-time Betfair odds into your application — from your first authenticated request to receiving live price updates over MQTT.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Prerequisites](#2-prerequisites)
3. [Authentication](#3-authentication)
4. [Quick Start: Your First API Call](#4-quick-start-your-first-api-call)
5. [Integration Workflow](#5-integration-workflow)
6. [API Reference](#6-api-reference)
7. [Request Bodies — Betfair Filter Syntax](#7-request-bodies--betfair-filter-syntax)
8. [Real-Time Odds via MQTT](#8-real-time-odds-via-mqtt)
9. [Error Codes](#9-error-codes)
10. [Rate Limits & Best Practices](#10-rate-limits--best-practices)
11. [Code Samples](#11-code-samples)
12. [Glossary](#12-glossary)
13. [Contact & Support](#13-contact--support)

---

## 1. Introduction

The Aura Betfair API provides authenticated access to Betfair exchange data through a simple REST interface, plus real-time odds streaming via MQTT. With this API you can:

- **Discover** available sports, competitions, and markets
- **Browse** market catalogues with full metadata (event details, runners, descriptions)
- **Fetch** point-in-time odds snapshots for any market
- **Subscribe** to markets for real-time odds updates delivered over MQTT
- **Receive** compressed, low-latency price updates for WIN, Fancy/LINE, and Bookmaker markets

All requests are authenticated using HMAC-SHA256 signatures — no OAuth flows, no session tokens to manage.

---

## 2. Prerequisites

Before making your first API call, you need:

| Item | How to get it |
|------|---------------|
| **API Key** | Provided by the Aura team during onboarding |
| **Shared Secret** | Provided alongside your API key (keep this private) |
| **Base URL** | `https://<your-assigned-host>` — provided during account setup |
| **MQTT Broker URL** | WebSocket endpoint provided separately (e.g. `wss://<broker-host>:8083/mqtt`) |
| **MQTT Username/Password** | Provided separately for real-time streaming access |

**Technical requirements:**

- Any HTTP client that supports custom headers (fetch, axios, curl, etc.)
- SHA-256 and HMAC-SHA256 capability in your language of choice
- MQTT client library with WebSocket support (for real-time streaming)
- Node.js 18+ if using the TypeScript reference client

---

## 3. Authentication

Every request to the Aura Betfair API must include three authentication headers:

| Header | Value |
|--------|-------|
| `X-Api-Key` | Your API key (provided during onboarding) |
| `X-Timestamp` | Current Unix time in **milliseconds** (e.g. `1716321600000`) |
| `X-Signature` | HMAC-SHA256 signature (see below) |

### 3.1 Signature Algorithm

The signature proves you possess the shared secret and that the request has not been tampered with.

**Step 1 — Hash the request body**

```
bodyHash = lowercase_hex( SHA-256( UTF-8_bytes(rawBody) ) )
```

If the request has no body, hash an empty string.

**Step 2 — Build the string to sign**

Concatenate four parts separated by newlines (`\n`):

```
stringToSign = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + BODY_HASH
```

| Part | Example | Notes |
|------|---------|-------|
| METHOD | `POST` | HTTP verb, uppercase |
| PATH | `/api/bf-gateway/listEventTypes` | URL path only — no host, no query string |
| TIMESTAMP | `1716321600000` | Same value as `X-Timestamp` header |
| BODY_HASH | `a1b2c3...` | From Step 1 |

**Step 3 — Compute the signature**

```
signature = lowercase_hex( HMAC-SHA256( UTF-8_bytes(stringToSign), UTF-8_bytes(sharedSecret) ) )
```

**Step 4 — Send the request**

Include all three headers:

```http
POST /api/bf-gateway/listEventTypes HTTP/1.1
Host: <your-assigned-host>
Content-Type: application/json
X-Api-Key: your_api_key_here
X-Timestamp: 1716321600000
X-Signature: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069
```

### 3.2 Clock Tolerance

The server allows a **±5 minute** window on `X-Timestamp`. If your system clock drifts beyond this, requests will be rejected with error `BF_AUTH003`.

### 3.3 Worked Example

Given:
- API Key: `a1b2c3d4e5f6a7b8`
- Shared Secret: `MySecretKey123`
- Method: `POST`
- Path: `/api/bf-gateway/listEventTypes`
- Body: `{"filter":{},"locale":"en"}`
- Timestamp: `1716321600000`

**Body hash:**
```
SHA-256("{"filter":{},"locale":"en"}") = "8d7a5c2f..."  (lowercase hex)
```

**String to sign:**
```
POST\n/api/bf-gateway/listEventTypes\n1716321600000\n8d7a5c2f...
```

**Signature:**
```
HMAC-SHA256("POST\n/api/bf-gateway/listEventTypes\n1716321600000\n8d7a5c2f...", "MySecretKey123") = "e9a1f3..."
```

### 3.4 Common Signing Mistakes

| Symptom | Likely cause |
|---------|-------------|
| `BF_AUTH007` Invalid signature | Body signed differs from body sent (pretty-printed vs compact JSON, trailing newline, wrong path) |
| `BF_AUTH003` Timestamp rejected | System clock is off by more than 5 minutes from UTC |
| `BF_AUTH007` on correct body | Path includes query string or host (should be path-only, e.g. `/api/bf-gateway/listEventTypes`) |

**Critical rule:** Sign the *exact same bytes* you send in the request body. If you `JSON.stringify` once, use that string for both signing and sending. Do not re-serialize.

---

## 4. Quick Start: Your First API Call

Let's make a working `listEventTypes` call in TypeScript:

```typescript
import { createHmac, createHash } from 'node:crypto';

const API_KEY = 'your_api_key';
const SHARED_SECRET = 'your_shared_secret';
const BASE_URL = 'https://<your-assigned-host>';

function sign(method: string, path: string, body: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
  const stringToSign = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
  const signature = createHmac('sha256', SHARED_SECRET)
    .update(stringToSign, 'utf8')
    .digest('hex');
  return {
    'X-Api-Key': API_KEY,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
  };
}

async function listEventTypes() {
  const path = '/api/bf-gateway/listEventTypes';
  const body = JSON.stringify({ filter: {}, locale: 'en' });
  const headers = sign('POST', path, body);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });

  const data = await res.json();
  console.log('Available sports:', data);
}

listEventTypes();
```

**Expected output:**
```json
[
  { "eventType": { "id": "4", "name": "Cricket" }, "marketCount": 245 },
  { "eventType": { "id": "1", "name": "Soccer" }, "marketCount": 1832 },
  { "eventType": { "id": "2", "name": "Tennis" }, "marketCount": 412 },
  { "eventType": { "id": "7", "name": "Horse Racing" }, "marketCount": 98 }
]
```

---

## 5. Integration Workflow

The typical integration follows this sequence:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DISCOVERY PHASE                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. listEventTypes         → Pick a sport (e.g. Cricket = "4")   │
│          ↓                                                        │
│  2. listMarketTypes        → See available types (MATCH_ODDS,    │
│                               TOURNAMENT_WINNER, etc.)            │
│          ↓                                                        │
│  3. listMarketCatalogue    → Browse specific markets              │
│                               Get: marketId, event, competition,  │
│                               runners, market description          │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                    IMPORT & SNAPSHOT                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  4. listMarketBook         → Get current odds snapshot            │
│                               Back/Lay prices, volumes, status    │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                    REAL-TIME STREAMING                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  5. subscribeMarkets       → Activate MQTT streaming for markets  │
│          ↓                                                        │
│  6. MQTT bf/{marketId}     → Receive continuous odds updates      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Key concept:** Steps 1–3 are for *discovery* — finding the markets you care about. Step 4 gives you a *snapshot* of current prices. Step 5 activates *streaming* so you receive every price change in real-time without polling.

---

## 6. API Reference

All endpoints accept `POST` with a JSON body and return JSON.

**Base path:** `https://<your-assigned-host>/api/bf-gateway/`

---

### 6.1 listEventTypes

Discover available sports/event types.

| | |
|---|---|
| **Endpoint** | `POST /api/bf-gateway/listEventTypes` |
| **Permission** | `eventTypes` |

**Request body:**

```json
{
  "filter": {},
  "locale": "en"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filter` | object | Yes | Market filter (see [Section 7](#7-request-bodies--betfair-filter-syntax)). Use `{}` for all. |
| `locale` | string | No | Language code for translated names (default: `en`) |

**Response:**

```json
[
  {
    "eventType": {
      "id": "4",
      "name": "Cricket"
    },
    "marketCount": 245
  },
  {
    "eventType": {
      "id": "1",
      "name": "Soccer"
    },
    "marketCount": 1832
  }
]
```

| Field | Description |
|-------|-------------|
| `eventType.id` | Unique sport identifier (use in filters for other endpoints) |
| `eventType.name` | Human-readable sport name |
| `marketCount` | Number of currently available markets for this sport |

---

### 6.2 listMarketTypes

Discover market types available within a sport.

| | |
|---|---|
| **Endpoint** | `POST /api/bf-gateway/listMarketTypes` |
| **Permission** | `marketTypes` |

**Request body:**

```json
{
  "filter": {
    "eventTypeIds": ["4"]
  },
  "locale": "en"
}
```

**Response:**

```json
[
  { "marketType": "MATCH_ODDS", "marketCount": 120 },
  { "marketType": "TOURNAMENT_WINNER", "marketCount": 8 },
  { "marketType": "INNINGS_RUNS", "marketCount": 45 },
  { "marketType": "NEXT_BALL_MULTI", "marketCount": 30 }
]
```

| Field | Description |
|-------|-------------|
| `marketType` | Type identifier (use in filters for `listMarketCatalogue`) |
| `marketCount` | Number of available markets of this type |

**Common market types:**

| Type | Description |
|------|-------------|
| `MATCH_ODDS` | Winner of the match (2-way or 3-way) |
| `TOURNAMENT_WINNER` | Outright winner of a tournament |
| `INNINGS_RUNS` | Total runs in an innings (LINE market) |
| `NEXT_BALL_MULTI` | Next ball outcome predictions |
| `OVER_UNDER_*` | Over/under totals |

---

### 6.3 listMarketCatalogue

Browse markets with full metadata. **This is your main discovery endpoint** — use it to find markets you want to import and subscribe to.

| | |
|---|---|
| **Endpoint** | `POST /api/bf-gateway/listMarketCatalogue` |
| **Permission** | `catalogue` |

**Request body:**

```json
{
  "filter": {
    "eventTypeIds": ["4"],
    "marketBettingTypes": ["ODDS"],
    "inPlayOnly": true
  },
  "marketProjections": [
    "MARKET_DESCRIPTION",
    "RUNNER_DESCRIPTION",
    "EVENT",
    "COMPETITION"
  ],
  "marketSort": "FIRST_TO_START",
  "maxResults": "25"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filter` | object | Yes | Market filter (see [Section 7](#7-request-bodies--betfair-filter-syntax)) |
| `marketProjections` | string[] | No | What extra data to include. Options: `MARKET_DESCRIPTION`, `RUNNER_DESCRIPTION`, `EVENT`, `COMPETITION`, `MARKET_START_TIME`, `RUNNER_METADATA` |
| `marketSort` | string | No | Sort order: `FIRST_TO_START`, `LAST_TO_START`, `MINIMUM_AVAILABLE`, `MAXIMUM_AVAILABLE` |
| `maxResults` | string | No | Maximum results to return (default varies; recommend 25–100) |

**Response:**

```json
[
  {
    "marketId": "1.234567890",
    "marketName": "Match Odds",
    "totalMatched": 458293.52,
    "event": {
      "id": "33012345",
      "name": "Mumbai Indians v Chennai Super Kings",
      "countryCode": "IN",
      "timezone": "Asia/Kolkata",
      "openDate": "2026-05-22T14:00:00.000Z"
    },
    "competition": {
      "id": "12345678",
      "name": "Indian Premier League"
    },
    "description": {
      "bettingType": "ODDS",
      "marketTime": "2026-05-22T14:00:00.000Z",
      "marketType": "MATCH_ODDS",
      "turnInPlayEnabled": true,
      "persistenceEnabled": true
    },
    "runners": [
      {
        "selectionId": 1001,
        "runnerName": "Mumbai Indians",
        "sortPriority": 1
      },
      {
        "selectionId": 1002,
        "runnerName": "Chennai Super Kings",
        "sortPriority": 2
      }
    ]
  }
]
```

**Key response fields:**

| Field | Description |
|-------|-------------|
| `marketId` | **The unique market identifier** — you need this for `listMarketBook` and `subscribeMarkets` |
| `marketName` | Human-readable market name |
| `totalMatched` | Total amount matched on this market (in base currency) |
| `event.id` | Event identifier (used in MQTT topic `bf/{eventId}/{marketId}`) |
| `event.name` | Event name (e.g. match title) |
| `event.openDate` | Scheduled start time (ISO 8601) |
| `competition.id` | Competition/league identifier |
| `competition.name` | Competition name (e.g. "Indian Premier League") |
| `description.bettingType` | `ODDS` (standard), `LINE` (handicap/totals), `RANGE` |
| `description.marketType` | Market type string (MATCH_ODDS, INNINGS_RUNS, etc.) |
| `description.turnInPlayEnabled` | Whether this market goes in-play |
| `runners[].selectionId` | Unique runner/selection ID (appears in MQTT messages as `r[].id`) |
| `runners[].runnerName` | Runner/team/outcome name |
| `runners[].sortPriority` | Display order |

**Importing a market:** Save the `marketId`, `event`, `competition`, and `runners` from this response. The `marketId` is what you'll use for odds and subscriptions.

---

### 6.4 listMarketBook

Get a point-in-time snapshot of current odds for one or more markets.

| | |
|---|---|
| **Endpoint** | `POST /api/bf-gateway/listMarketBook` |
| **Permission** | `book` |

**Request body:**

```json
{
  "marketIds": ["1.234567890"],
  "priceProjection": {
    "priceData": ["EX_BEST_OFFERS"]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `marketIds` | string[] | Yes | Array of market IDs to fetch (max ~40 per request) |
| `priceProjection.priceData` | string[] | No | What price data to include. Options: `EX_BEST_OFFERS` (top 3 back/lay), `EX_ALL_OFFERS`, `EX_TRADED`, `SP_AVAILABLE`, `SP_TRADED` |

**Response:**

```json
[
  {
    "marketId": "1.234567890",
    "isMarketDataDelayed": false,
    "status": "OPEN",
    "inplay": true,
    "numberOfWinners": 1,
    "numberOfRunners": 2,
    "numberOfActiveRunners": 2,
    "totalMatched": 458293.52,
    "totalAvailable": 12450.00,
    "runners": [
      {
        "selectionId": 1001,
        "status": "ACTIVE",
        "lastPriceTraded": 1.85,
        "totalMatched": 230100.00,
        "ex": {
          "availableToBack": [
            { "price": 1.85, "size": 500.00 },
            { "price": 1.84, "size": 1200.00 },
            { "price": 1.83, "size": 3000.00 }
          ],
          "availableToLay": [
            { "price": 1.86, "size": 450.00 },
            { "price": 1.87, "size": 800.00 },
            { "price": 1.88, "size": 2500.00 }
          ]
        }
      },
      {
        "selectionId": 1002,
        "status": "ACTIVE",
        "lastPriceTraded": 2.14,
        "totalMatched": 228193.52,
        "ex": {
          "availableToBack": [
            { "price": 2.14, "size": 600.00 },
            { "price": 2.12, "size": 1500.00 },
            { "price": 2.10, "size": 4000.00 }
          ],
          "availableToLay": [
            { "price": 2.16, "size": 550.00 },
            { "price": 2.18, "size": 900.00 },
            { "price": 2.20, "size": 3200.00 }
          ]
        }
      }
    ]
  }
]
```

**Key response fields:**

| Field | Description |
|-------|-------------|
| `status` | Market status: `OPEN`, `SUSPENDED`, `CLOSED`, `INACTIVE` |
| `inplay` | Whether the market is currently in-play (live) |
| `runners[].selectionId` | Matches `selectionId` from catalogue and `id` in MQTT messages |
| `runners[].status` | Runner status: `ACTIVE`, `WINNER`, `LOSER`, `REMOVED` |
| `runners[].lastPriceTraded` | Most recent matched price |
| `runners[].ex.availableToBack` | Best back prices (highest first) |
| `runners[].ex.availableToLay` | Best lay prices (lowest first) |
| `price` | Decimal odds (e.g. 1.85 = "85 paise" or "17/20" fractional) |
| `size` | Amount available at this price (in base currency) |

**Understanding Back and Lay:**

- **Back** = betting *for* an outcome (you win if it happens)
- **Lay** = betting *against* an outcome (you win if it doesn't happen)
- The gap between best back and best lay is the "spread"

---

### 6.5 subscribeMarkets

Subscribe to real-time odds streaming via MQTT for specified markets.

| | |
|---|---|
| **Endpoint** | `POST /api/bf-gateway/subscribeMarkets` |
| **Permission** | `subscribe` |

**Request body:**

```json
{
  "marketIds": ["1.234567890", "1.234567891"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `marketIds` | string[] | Yes | Market IDs to subscribe (max **50** per request) |

**Validation rules:**
- Maximum 50 market IDs per request
- Only standard WIN market IDs accepted (exactly 11 characters)
- IDs ending with `_SB` (Bookmaker) or `_BR` are rejected
- Duplicate IDs in the same request are deduplicated automatically

**Response:**

```json
{
  "subscribed": ["1.234567890"],
  "alreadySubscribed": ["1.234567891"],
  "rejected": []
}
```

| Field | Description |
|-------|-------------|
| `subscribed` | Markets newly activated for streaming |
| `alreadySubscribed` | Markets you had already subscribed (idempotent — no error) |
| `rejected` | IDs that failed validation (wrong format, too long, bookmaker IDs, etc.) |

**After subscribing:** Odds updates will begin arriving on your MQTT connection within seconds. See [Section 8](#8-real-time-odds-via-mqtt) for how to consume them.

**Note:** Subscriptions are persistent per client. You do not need to re-subscribe after MQTT reconnections — the market remains active on the server side.

---

## 7. Request Bodies — Betfair Filter Syntax

The `filter` field used in `listEventTypes`, `listMarketTypes`, and `listMarketCatalogue` follows the Betfair MarketFilter structure.

### 7.1 Available Filter Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `textQuery` | string | Free-text search across event/market names | `"IPL"` |
| `eventTypeIds` | string[] | Filter by sport | `["4"]` (Cricket) |
| `competitionIds` | string[] | Filter by competition/league | `["12345678"]` |
| `eventIds` | string[] | Filter by specific event | `["33012345"]` |
| `marketIds` | string[] | Filter by specific market IDs | `["1.234567890"]` |
| `marketBettingTypes` | string[] | Filter by betting type | `["ODDS", "LINE"]` |
| `inPlayOnly` | boolean | Only in-play markets | `true` |
| `marketStartTime` | object | Time range filter | `{ "from": "...", "to": "..." }` |

### 7.2 Market Start Time Filter

```json
{
  "filter": {
    "eventTypeIds": ["4"],
    "marketStartTime": {
      "from": "2026-05-22T00:00:00Z",
      "to": "2026-05-23T00:00:00Z"
    }
  }
}
```

### 7.3 Combining Filters

Filters are combined with AND logic. This finds all in-play Cricket MATCH_ODDS markets:

```json
{
  "filter": {
    "eventTypeIds": ["4"],
    "marketBettingTypes": ["ODDS"],
    "inPlayOnly": true
  }
}
```

### 7.4 Common Search Examples

**Find all live Cricket markets (any type):**

```json
{
  "filter": {
    "eventTypeIds": ["4"],
    "inPlayOnly": true
  },
  "marketProjections": ["EVENT", "COMPETITION", "RUNNER_DESCRIPTION", "MARKET_DESCRIPTION"],
  "maxResults": "50"
}
```

**Search by event/team name (e.g. "Mumbai"):**

```json
{
  "filter": {
    "textQuery": "Mumbai",
    "eventTypeIds": ["4"]
  },
  "marketProjections": ["EVENT", "COMPETITION", "RUNNER_DESCRIPTION", "MARKET_DESCRIPTION"],
  "marketSort": "FIRST_TO_START",
  "maxResults": "25"
}
```

**Find all MATCH_ODDS markets for a specific competition (e.g. IPL):**

```json
{
  "filter": {
    "competitionIds": ["12345678"],
    "marketBettingTypes": ["ODDS"]
  },
  "marketProjections": ["EVENT", "RUNNER_DESCRIPTION", "MARKET_DESCRIPTION"],
  "marketSort": "FIRST_TO_START",
  "maxResults": "50"
}
```

**Find markets starting today (Soccer):**

```json
{
  "filter": {
    "eventTypeIds": ["1"],
    "marketStartTime": {
      "from": "2026-05-22T00:00:00Z",
      "to": "2026-05-22T23:59:59Z"
    }
  },
  "marketProjections": ["EVENT", "COMPETITION", "RUNNER_DESCRIPTION", "MARKET_DESCRIPTION"],
  "marketSort": "FIRST_TO_START",
  "maxResults": "100"
}
```

**Find LINE markets (fancy/handicap) for a specific event:**

```json
{
  "filter": {
    "eventIds": ["33012345"],
    "marketBettingTypes": ["LINE"]
  },
  "marketProjections": ["RUNNER_DESCRIPTION", "MARKET_DESCRIPTION"],
  "maxResults": "50"
}
```

**Find all Tennis in-play markets:**

```json
{
  "filter": {
    "eventTypeIds": ["2"],
    "inPlayOnly": true,
    "marketBettingTypes": ["ODDS"]
  },
  "marketProjections": ["EVENT", "COMPETITION", "RUNNER_DESCRIPTION"],
  "marketSort": "FIRST_TO_START",
  "maxResults": "50"
}
```

**Get a specific market by ID (verify it exists):**

```json
{
  "filter": {
    "marketIds": ["1.234567890"]
  },
  "marketProjections": ["EVENT", "COMPETITION", "RUNNER_DESCRIPTION", "MARKET_DESCRIPTION"],
  "maxResults": "1"
}
```

### 7.5 Market Projections

Control what metadata is returned in `listMarketCatalogue`:

| Projection | Adds to response |
|------------|-----------------|
| `EVENT` | `event` object (name, date, country) |
| `COMPETITION` | `competition` object (name, id) |
| `MARKET_DESCRIPTION` | `description` object (type, betting type, market time) |
| `RUNNER_DESCRIPTION` | `runners` array (names, selection IDs, sort priority) |
| `RUNNER_METADATA` | Extended runner info (jockey, trainer — for horse racing) |
| `MARKET_START_TIME` | `marketStartTime` field |

**Recommendation:** Always include `EVENT`, `COMPETITION`, `RUNNER_DESCRIPTION`, and `MARKET_DESCRIPTION` to get complete market context for importing.

### 7.6 Full Betfair Reference

For the complete filter specification, see the official Betfair Betting API documentation:
https://betfair-developer-docs.atlassian.net/wiki/spaces/1smk3cen4v3lu3yomq5qye0ni/pages/2687158/Betting+API

---

## 8. Real-Time Odds via MQTT

Once you subscribe to markets via the API, odds updates are pushed to you over MQTT in real-time.

### 8.1 Connecting to the Broker

| Setting | Value |
|---------|-------|
| **Protocol** | MQTT over WebSocket (WSS) |
| **Broker URL** | Provided during onboarding (e.g. `wss://<broker>:8083/mqtt`) |
| **Username** | Provided separately |
| **Password** | Provided separately |
| **Clean Session** | `true` (recommended for new connections) |
| **Keep Alive** | 30 seconds |

**TypeScript connection example (using mqtt.js):**

```typescript
import mqtt from 'mqtt';

const client = mqtt.connect('wss://<broker>:8083/mqtt', {
  username: 'your_mqtt_username',
  password: 'your_mqtt_password',
  clean: true,
  keepalive: 30,
  reconnectPeriod: 5000,
});

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  // Subscribe to a specific market
  client.subscribe('bf/1.234567890');
  // Or subscribe to all markets in an event
  client.subscribe('bf/33012345/#');
});

client.on('message', (topic, payload) => {
  const message = JSON.parse(payload.toString());
  console.log(`[${topic}]`, message);
});

client.on('error', (err) => {
  console.error('MQTT error:', err);
});
```

### 8.2 Topic Patterns

| Topic | Description | Use case |
|-------|-------------|----------|
| `bf/{marketId}` | Updates for a specific market | Subscribe to individual markets after `subscribeMarkets` |
| `bf/{eventId}/{marketId}` | Same payload, event-scoped | Use wildcard `bf/{eventId}/#` to get all markets in one event |

**Examples:**
- `bf/1.234567890` — Match Odds for a specific match
- `bf/33012345/#` — All markets (WIN, Fancy, Bookmaker) for event 33012345
- `bf/#` — All markets across all events (high volume — use carefully)

### 8.3 Message Format

All MQTT messages are JSON with a compact field naming scheme for minimal bandwidth. Here's the common structure:

```json
{
  "id": "1.234567890",
  "s": 1,
  "ip": 1,
  "sl": "",
  "bt": 1,
  "h": 0,
  "t": 1716321600000,
  "r": [
    {
      "id": 1001,
      "s": 0,
      "b": [[0.0, 1.85, 0.0]],
      "l": [[0.0, 1.86, 0.0]]
    }
  ]
}
```

### 8.4 Field Reference — Market Level

| Field | Type | Description | Values |
|-------|------|-------------|--------|
| `id` | string | Market ID | e.g. `"1.234567890"` |
| `s` | int | Market status | `0`=INACTIVE, `1`=OPEN, `2`=SUSPENDED, `3`=CLOSED |
| `ip` | int | In-play flag | `0`=pre-match, `1`=live/in-play |
| `sl` | string | Status label | Human-readable (e.g. `"Ball Running"`, `"SUSPENDED"`) |
| `bt` | int | Bettable flag | `0`=not accepting bets, `1`=accepting bets |
| `h` | int | Hidden flag | `0`=visible, `1`=hidden from customers |
| `t` | long | Timestamp | Unix milliseconds (UTC) when this update was generated |
| `openKey` | string? | Open rotation key | Present only when market transitions to OPEN status |
| `r` | array | Runners | Array of runner objects (see below) |

### 8.5 Field Reference — Runner Level

| Field | Type | Description | Values |
|-------|------|-------------|--------|
| `id` | long | Runner/Selection ID | Matches `selectionId` from `listMarketCatalogue` |
| `s` | int | Runner status | `0`=ACTIVE, `1`=WINNER, `2`=LOSER, `3`=REMOVED, `4`=REMOVED_VACANT, `5`=HIDDEN, `6`=PLACED |
| `b` | array | Back prices | Array of price tuples (see format by market type) |
| `l` | array | Lay prices | Array of price tuples (see format by market type) |

### 8.6 WIN Market Payload

Standard match odds and outright markets. Market ID is exactly 11 characters (e.g. `1.234567890`).

**Back/Lay tuple format:** `[volume, price, depth_volume]`

```json
{
  "id": "1.234567890",
  "s": 1,
  "ip": 1,
  "sl": "",
  "bt": 1,
  "h": 0,
  "t": 1716321600000,
  "r": [
    {
      "id": 1001,
      "s": 0,
      "b": [[0.0, 1.85, 0.0]],
      "l": [[0.0, 1.86, 0.0]]
    },
    {
      "id": 1002,
      "s": 0,
      "b": [[0.0, 2.14, 0.0]],
      "l": [[0.0, 2.16, 0.0]]
    }
  ]
}
```

**Reading the odds:**
- Runner 1001: Back at **1.85**, Lay at **1.86**
- Runner 1002: Back at **2.14**, Lay at **2.16**

### 8.7 Fancy / LINE Market Payload

Handicap, total runs, over/under markets. Market ID contains `.FY` or `RD.FY` suffix.

**Back/Lay tuple format:** `[volume, line, price]`

```json
{
  "id": "1.234567890-12345RD.FY",
  "s": 1,
  "ip": 1,
  "sl": "",
  "bt": 1,
  "h": 0,
  "t": 1716321600000,
  "r": [
    {
      "id": 1,
      "s": 0,
      "b": [[0.0, 145, 1.83]],
      "l": [[0.0, 145, 1.91]]
    }
  ]
}
```

**Reading the odds:**
- Line value: **145** (e.g. total runs)
- Back: **1.83** odds that the total will be 145 or more
- Lay: **1.91** odds against

**Understanding LINE markets:**
The `line` is an integer representing a threshold (runs, goals, points). "Back" means you believe the actual value will meet or exceed the line. "Lay" means you believe it won't.

### 8.8 Bookmaker Market Payload

Single-price markets offered by a bookmaker. Market ID ends with `_SB`.

**Back/Lay tuple format:** `[volume, price, depth_volume]`

```json
{
  "id": "1.12345FP_SB",
  "s": 1,
  "ip": 1,
  "sl": "",
  "bt": 1,
  "h": 0,
  "t": 1716321600000,
  "r": [
    {
      "id": 1001,
      "s": 0,
      "b": [[0.0, 1.85, 0.0]],
      "l": [[0.0, 1.90, 0.0]]
    },
    {
      "id": 1002,
      "s": 0,
      "b": [[0.0, 2.10, 0.0]],
      "l": [[0.0, 2.15, 0.0]]
    }
  ]
}
```

**Reading the odds:**
- Runner 1001: Back at **1.85**, Lay at **1.90**
- Same tuple format as WIN, but only one price level per side

### 8.9 Detecting Market Type from ID

| Pattern | Market Type | Odds tuple meaning |
|---------|-------------|-------------------|
| 11 characters (e.g. `1.234567890`) | **WIN** | `[vol, price, depth_vol]` |
| Contains `.FY` or `RD.FY` | **Fancy / LINE** | `[vol, line, price]` |
| Ends with `_SB` | **Bookmaker** | `[vol, price, depth_vol]` |

**TypeScript detection:**

```typescript
function getMarketType(marketId: string): 'WIN' | 'LINE' | 'BOOKMAKER' {
  if (marketId.endsWith('_SB')) return 'BOOKMAKER';
  if (marketId.includes('.FY')) return 'LINE';
  return 'WIN';
}
```

### 8.10 Market Status Transitions

```
INACTIVE (0) → OPEN (1) → SUSPENDED (2) → OPEN (1) → CLOSED (3)
                              ↑         ↓
                              └─────────┘  (can toggle during live play)
```

- **OPEN + bt=1**: Market is active and accepting bets
- **SUSPENDED + bt=0**: Market paused (e.g. during a ball being bowled in cricket)
- **sl="Ball Running"**: Common in cricket — market suspended during active play
- **CLOSED**: Market has been settled — check runner `s` for WINNER/LOSER

### 8.11 Reconnection Strategy

MQTT connections may drop (broker maintenance, network issues). Implement reconnection:

```typescript
const client = mqtt.connect(brokerUrl, {
  reconnectPeriod: 5000,   // retry every 5 seconds
  connectTimeout: 10000,   // 10 second timeout
  clean: true,
});

client.on('reconnect', () => {
  console.log('Reconnecting to MQTT...');
});

client.on('connect', () => {
  // Re-subscribe to your topics after reconnect
  client.subscribe(myTopics);
});
```

**Important:** Your market subscriptions on the server side persist across MQTT reconnections. You don't need to call `subscribeMarkets` again — just re-subscribe to the MQTT topics.

---

## 9. Error Codes

When a request fails authentication or validation, the response includes an error code:

```json
{
  "error": "Invalid signature",
  "code": "BF_AUTH007"
}
```

| Code | HTTP Status | Meaning | Resolution |
|------|-------------|---------|------------|
| `BF_AUTH001` | 401 | Missing required auth headers | Include `X-Api-Key`, `X-Timestamp`, `X-Signature` |
| `BF_AUTH002` | 401 | Unknown API key | Check your API key is correct |
| `BF_AUTH003` | 401 | Timestamp outside ±5 min window | Sync your system clock to NTP |
| `BF_AUTH004` | 403 | Client is disabled or revoked | Contact Aura support |
| `BF_AUTH005` | 403 | IP address not in allowlist | Request your IP be added, or use allowed IP |
| `BF_AUTH006` | 403 | Missing permission for endpoint | Request the required permission be added to your key |
| `BF_AUTH007` | 401 | Invalid signature | Check signing logic (see [Section 3.4](#34-common-signing-mistakes)) |
| `BF_SUB001` | 400 | Subscribe validation error | Check market ID format (11 chars, no `_SB`/`_BR`, max 50) |

---

## 10. Rate Limits & Best Practices

### 10.1 Rate Limits

Each API key has a per-minute rate limit (default: **60 requests/minute**). When exceeded, requests receive HTTP 429.

### 10.2 Best Practices

| Practice | Why |
|----------|-----|
| Use narrow filters in `listMarketCatalogue` | Reduces response size and server load |
| Cache catalogue data locally | Market metadata rarely changes — refresh every few minutes, not every request |
| Subscribe once per market | `subscribeMarkets` is idempotent — don't call repeatedly for the same IDs |
| Process MQTT messages asynchronously | During live events, messages arrive at high frequency (multiple per second) |
| Implement MQTT reconnection logic | Broker may restart; your subscriptions persist server-side |
| Sign the exact body bytes you send | Re-serializing JSON after signing is the #1 cause of auth failures |
| Keep your clock synced (NTP) | ±5 minute tolerance is generous, but drifting clocks cause intermittent failures |

---

## 11. Code Samples

A complete TypeScript reference client is available on GitHub:

**Repository:** [github.com/aura-e-gaming/betfair-api-client](https://github.com/aura-e-gaming/betfair-api-client)

The repository includes:
- `signing.ts` — SHA-256 + HMAC-SHA256 helper functions
- `client.ts` — HTTP client with automatic request signing
- `main.ts` — CLI tool covering all 5 API endpoints
- `mqtt-consumer.ts` — MQTT connection, topic subscription, and message parsing

### Quick start:

```bash
git clone https://github.com/aura-e-gaming/betfair-api-client.git
cd betfair-api-client
cp .env.example .env
# Edit .env with your credentials
npm install
npm start                    # runs listEventTypes by default
npm start listMarketCatalogue
npm start subscribeMarkets
npm run mqtt                 # starts MQTT consumer
```

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **Event Type** | A sport or category (e.g. Cricket, Soccer, Tennis). Identified by a numeric ID. |
| **Competition** | A league or tournament within a sport (e.g. Indian Premier League, UEFA Champions League). |
| **Event** | A specific match or race (e.g. "Mumbai Indians v Chennai Super Kings"). |
| **Market** | A betting market on an event (e.g. "Match Odds", "Total Runs"). Each market has a unique ID. |
| **Runner / Selection** | An outcome within a market (e.g. "Mumbai Indians" in a Match Odds market, or "Over 145.5" in a LINE market). |
| **Back** | A bet *for* an outcome. You win if the outcome happens. The "back price" is the odds offered. |
| **Lay** | A bet *against* an outcome. You win if the outcome does NOT happen. The "lay price" is the odds you must offer. |
| **Odds** | Decimal multiplier for a bet. Odds of 2.00 mean you win 1x your stake as profit (plus stake returned). |
| **Line** | A threshold value in LINE markets (e.g. 145 runs). Back means you believe the actual value meets/exceeds the line. |
| **In-Play** | A market that is live — the event has started and prices change in real-time based on what's happening. |
| **Volume / Size** | The amount of money available at a given price. |
| **Matched** | The total amount of money that has been bet (matched between backers and layers) on a market. |
| **Spread** | The gap between the best back price and best lay price. Tighter spread = more liquid market. |
| **WIN Market** | Standard exchange market where you back/lay outcomes at decimal odds. |
| **LINE Market** | Handicap or totals market where a "line" value is the threshold. Also called Fancy in cricket. |
| **Bookmaker Market** | Single-price market offered by a bookmaker (not exchange). ID ends with `_SB`. |

---

## 13. Contact & Support

For API access, onboarding, credentials, and custom integrations:

**Telegram:** [@aura_e_gaming](https://t.me/aura_e_gaming)

**Available APIs:**
- Betfair Exchange Odds (WIN markets)
- Fancy / LINE Markets (cricket specials, handicaps)
- Session & Authentication Management

Reach out on Telegram to get started with your integration.

---

*© 2026 Aura E-Gaming. This documentation is confidential and intended for authorized API clients only.*
