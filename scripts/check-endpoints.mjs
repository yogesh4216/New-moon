// Preflight for the endpoints the wallet actually uses.
//
// An HTTPS probe of the indexer is not enough: sync also needs a WebSocket to
// the indexer and one to the RPC node. Those use a different port/protocol and
// are frequently what a corporate proxy or VPN blocks, producing a repeating
// "disconnected ... 1000:: Normal Closure" loop rather than a clean failure.
import { WebSocket } from 'ws';

const NETWORKS = {
  preprod: {
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'wss://rpc.preprod.midnight.network',
  },
  preview: {
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    node: 'wss://rpc.preview.midnight.network',
  },
};

const network = process.argv[2] ?? 'preprod';
const cfg = NETWORKS[network];
if (!cfg) {
  console.error(`Unknown network "${network}". Use: preprod | preview`);
  process.exit(2);
}

const TIMEOUT_MS = 15_000;

const checkHttp = async (url) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctl.signal });
    // A healthy GraphQL endpoint rejects a bare GET with 400/405. 401/403/407
    // mean something in the path refused us — a proxy, not the service.
    const blocked = [401, 403, 407].includes(res.status);
    const ok = !blocked && res.status < 500;
    const why = blocked ? ' (blocked — proxy or firewall)' : '';
    return { ok, detail: `HTTP ${res.status}${why}` };
  } catch (e) {
    return { ok: false, detail: e.name === 'AbortError' ? 'timed out' : e.message };
  } finally {
    clearTimeout(t);
  }
};

const checkWs = (url, protocols) =>
  new Promise((resolve) => {
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* already closing */ }
      resolve(r);
    };

    const ws = new WebSocket(url, protocols);
    const timer = setTimeout(() => done({ ok: false, detail: 'timed out' }), TIMEOUT_MS);

    ws.on('open', () => { clearTimeout(timer); done({ ok: true, detail: 'connected' }); });
    ws.on('error', (e) => { clearTimeout(timer); done({ ok: false, detail: e.message }); });
    ws.on('close', (code, reason) => {
      clearTimeout(timer);
      done({ ok: false, detail: `closed before open (${code}${reason?.length ? ` ${reason}` : ''})` });
    });
  });

const results = [
  ['indexer  (https)', await checkHttp(cfg.indexer)],
  ['indexer  (wss)  ', await checkWs(cfg.indexerWS, 'graphql-transport-ws')],
  ['rpc node (wss)  ', await checkWs(cfg.node)],
];

console.log(`\n  Endpoint check — ${network}\n`);
for (const [label, r] of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${label}  ${r.detail}`);
}

const failed = results.filter(([, r]) => !r.ok);
if (failed.length === 0) {
  console.log('\n  All endpoints reachable.\n');
  process.exit(0);
}

console.log(`
  ${failed.length} endpoint(s) unreachable. Wallet sync needs all three.

  A blocked WebSocket typically shows up as a sync that never advances,
  with repeating "disconnected ... 1000:: Normal Closure" messages.

  Common causes: a corporate proxy or VPN that permits HTTPS but not
  WebSocket upgrades, or a firewall rule on outbound wss://.
`);
process.exit(1);
