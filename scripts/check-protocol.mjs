// Reports which ledger protocol version a network's indexer is emitting.
//
// Ledger events are prefixed with an ASCII tag, "midnight:event[v9]:". The
// wallet SDK can only deserialize events matching the ledger-vN package it was
// built against, so a network emitting a version the SDK does not carry means
// no event is ever applied — sync sits at 0 forever with no useful error.
import { WebSocket } from 'ws';

const WS = {
  preprod: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  preview: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
};

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['preprod', 'preview'];

const probe = (network) =>
  new Promise((resolve) => {
    const url = WS[network];
    if (!url) return resolve({ network, error: `unknown network "${network}"` });

    const ws = new WebSocket(url, 'graphql-transport-ws');
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* closing */ }
      resolve({ network, ...r });
    };
    const timer = setTimeout(() => done({ error: 'timed out' }), 25_000);

    ws.on('open', () => ws.send(JSON.stringify({ type: 'connection_init', payload: {} })));
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'connection_ack') {
        ws.send(JSON.stringify({
          id: '1',
          type: 'subscribe',
          payload: {
            query: 'subscription ZswapEvents($id: Int) { zswapLedgerEvents(id: $id) { id raw protocolVersion maxId } }',
            variables: { id: 0 },
          },
        }));
        return;
      }
      if (msg.type === 'next') {
        clearTimeout(timer);
        const ev = msg.payload?.data?.zswapLedgerEvents;
        const raw = ev?.raw ?? '';
        const prefix = Buffer.from(raw.slice(0, 40), 'hex').toString('utf8');
        const tag = /midnight:event\[(v\d+)\]/.exec(prefix)?.[1];
        return done({ tag, protocolVersion: ev?.protocolVersion, maxId: ev?.maxId });
      }
      if (msg.type === 'error') {
        clearTimeout(timer);
        return done({ error: JSON.stringify(msg.payload).slice(0, 200) });
      }
    });
    ws.on('error', (e) => { clearTimeout(timer); done({ error: e.message }); });
    ws.on('close', (c) => { clearTimeout(timer); done({ error: `closed (${c})` }); });
  });

// What this checkout can actually deserialize. Read package.json off disk:
// these packages do not export "./package.json", so require() of it fails even
// when the package is present.
const { readFileSync, existsSync } = await import('node:fs');
const { resolve, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const installed = [];
for (const v of ['v8', 'v9']) {
  for (const scope of ['@midnight-ntwrk', '@midnightntwrk']) {
    const pkg = resolve(root, 'node_modules', scope, `ledger-${v}`, 'package.json');
    if (existsSync(pkg)) {
      installed.push(`${v} (${JSON.parse(readFileSync(pkg, 'utf8')).version})`);
      break;
    }
  }
}

console.log('\n  Ledger protocol check\n');
console.log(`  Installed ledger packages: ${installed.length ? installed.join(', ') : 'none found'}\n`);

let mismatch = false;
let probeFailed = false;
for (const network of targets) {
  const r = await probe(network);
  if (r.error) {
    probeFailed = true;
    console.log(`  ${network.padEnd(8)} ✗ ${r.error}`);
    continue;
  }
  const supported = installed.some((i) => i.startsWith(r.tag ?? '—'));
  if (!supported) mismatch = true;
  console.log(
    `  ${network.padEnd(8)} emits ${r.tag ?? 'unknown'}  ` +
      `(protocolVersion ${r.protocolVersion}, maxId ${r.maxId})  ` +
      `${supported ? '✓ supported here' : '✗ NOT supported by installed SDK'}`,
  );
}

if (mismatch) {
  console.log(`
  A network emitting a protocol this checkout cannot deserialize will never
  sync: every event is rejected, nothing is applied, and the chain height
  stays 0. Either target a network on a supported protocol, or move the whole
  stack (wallet-sdk, midnight-js, ledger-vN, proof-server, compiled contract)
  to the matching version.
`);
  process.exit(1);
}
if (probeFailed) {
  console.log('\n  At least one network could not be reached — no conclusion for it.\n');
  process.exit(2);
}
console.log('\n  All checked networks are on a supported protocol.\n');
