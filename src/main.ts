import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bfGatewayPostJson } from './client.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).trim();
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    console.error(`Missing env ${name}. Copy .env.example to .env and fill values.`);
    process.exit(1);
  }
  return v.trim();
}

async function main(): Promise<void> {
  const baseUrl = requireEnv('BF_GATEWAY_BASE_URL');
  const apiKey = requireEnv('BF_API_KEY');
  const sharedSecret = requireEnv('BF_SHARED_SECRET');
  const cmd = (process.argv[2] ?? 'listEventTypes').toLowerCase();

  const cfg = { baseUrl, apiKey, sharedSecret };

  let path: string;
  let body: unknown;

  switch (cmd) {
    case 'listeventtypes':
      path = '/api/bf-gateway/listEventTypes';
      body = { filter: {}, locale: null };
      break;
    case 'listmarkettypes':
      path = '/api/bf-gateway/listMarketTypes';
      body = { filter: { textQuery: 'cricket' }, locale: 'en' };
      break;
    case 'listmarketcatalogue':
      path = '/api/bf-gateway/listMarketCatalogue';
      body = {
        filter: { textQuery: 'ipl' },
        marketProjections: [
          'MARKET_DESCRIPTION',
          'RUNNER_DESCRIPTION',
          'EVENT',
          'COMPETITION',
        ],
        marketSort: 'FIRST_TO_START',
        maxResults: '25',
      };
      break;
    case 'listmarketbook':
      path = '/api/bf-gateway/listMarketBook';
      body = {
        marketIds: ['1.234567'],
        priceProjection: { priceData: ['EX_BEST_OFFERS'] },
      };
      break;
    case 'subscribemarkets':
      path = '/api/bf-gateway/subscribeMarkets';
      body = { marketIds: ['1.234567890'] };
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error(
        'Usage: pnpm start [listEventTypes|listMarketTypes|listMarketCatalogue|listMarketBook|subscribeMarkets]',
      );
      process.exit(1);
  }

  const res = await bfGatewayPostJson(cfg, path, body);
  const text = await res.text();
  console.log(`HTTP ${res.status} ${res.statusText}`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
