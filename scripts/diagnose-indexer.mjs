// Asks the indexer directly whether it will serve this client data.
//
// `highestTransactionId` — the number whose staying at 0 means sync never
// starts — comes from the indexer, not the RPC node. check-endpoints only
// proves a socket opens; this proves the GraphQL API answers, that the schema
// is the one the SDK expects, and that a subscription actually delivers.
import { WebSocket } from 'ws';

const NETWORKS = {
  preprod: {
    http: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    ws: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  },
  preview: {
    http: 'https://indexer.preview.midnight.network/api/v4/graphql',
    ws: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  },
};

const network = process.argv[2] ?? 'preprod';
const cfg = NETWORKS[network];
if (!cfg) {
  console.error(`Unknown network "${network}". Use: preprod | preview`);
  process.exit(2);
}

const line = (s = '') => console.log(s);
const show = (v) => JSON.stringify(v, null, 2).split('\n').slice(0, 24).join('\n');

line(`\n  Indexer diagnosis — ${network}`);
line(`  ${cfg.http}\n`);

// ── 1. Does the HTTP API answer a basic query? ───────────────────────────────
line('  [1] block height over HTTPS');
let httpOk = false;
try {
  const res = await fetch(cfg.http, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ block { height hash } }' }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }

  if (res.status !== 200) {
    line(`      ✗ HTTP ${res.status}`);
    line(`      ${typeof body === 'string' ? body.slice(0, 300) : show(body)}`);
  } else if (body?.errors) {
    line('      ✗ GraphQL errors — the schema is not what this client expects:');
    line(`      ${show(body.errors)}`);
    line('      This usually means an API-version mismatch (the SDK targets /api/v4).');
  } else {
    const h = body?.data?.block?.height;
    line(`      ✓ chain height ${h}`);
    httpOk = true;
  }
} catch (e) {
  line(`      ✗ ${e.name === 'TimeoutError' ? 'timed out' : e.message}`);
}

// ── 2. Does a subscription actually deliver? ─────────────────────────────────
line('\n  [2] graphql-transport-ws subscription');

const wsResult = await new Promise((resolve) => {
  const ws = new WebSocket(cfg.ws, 'graphql-transport-ws');
  let acked = false;
  let settled = false;

  const done = (r) => {
    if (settled) return;
    settled = true;
    try { ws.close(); } catch { /* closing */ }
    resolve(r);
  };

  const timer = setTimeout(
    () => done({ ok: false, why: acked ? 'connected and acked, but no data within 25s' : 'no connection_ack within 25s' }),
    25_000,
  );

  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'connection_init', payload: {} }));
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'connection_ack') {
      acked = true;
      line('      ✓ connection_ack');
      ws.send(JSON.stringify({
        id: '1',
        type: 'subscribe',
        payload: { query: 'subscription { blocks { height hash } }' },
      }));
      return;
    }
    if (msg.type === 'next') {
      clearTimeout(timer);
      line(`      ✓ data: ${JSON.stringify(msg.payload?.data)?.slice(0, 160)}`);
      return done({ ok: true });
    }
    if (msg.type === 'error') {
      clearTimeout(timer);
      line('      ✗ subscription error:');
      line(`      ${show(msg.payload)}`);
      return done({ ok: false, why: 'subscription rejected — likely a schema/version mismatch' });
    }
  });

  ws.on('error', (e) => { clearTimeout(timer); done({ ok: false, why: e.message }); });
  ws.on('close', (code, reason) => {
    clearTimeout(timer);
    done({ ok: false, why: `closed (${code}${reason?.length ? ` ${reason}` : ''})` });
  });
});

if (!wsResult.ok) line(`      ✗ ${wsResult.why}`);

// ── verdict ─────────────────────────────────────────────────────────────────
line('\n  ── verdict ─────────────────────────────────────────────');
if (httpOk && wsResult.ok) {
  line('  The indexer serves this client correctly over both transports.');
  line('  A sync stuck at 0/0 is then NOT the network or the indexer —');
  line('  suspect the Node version or the SDK/network version pairing.\n');
  process.exit(0);
}
line('  The indexer is not serving this client usable data.');
line('  That is why highestTransactionId stays 0 and sync never starts;');
line('  it is not a Node problem and not a slow sync.\n');
process.exit(1);
