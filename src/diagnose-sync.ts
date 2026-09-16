/**
 * Runs the exact GraphQL subscriptions the wallet SDK uses, one at a time, and
 * reports which succeed.
 *
 * `diagnose-indexer` subscribes to `blocks`, which proves the indexer is alive
 * but not that it serves the *wallet's* operations. These are the real ones:
 * `UnshieldedTransactions` is what yields `highestTransactionId`, the value
 * whose staying at 0 means sync never starts.
 */
import { WebSocket } from 'ws';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { resolveNetwork, getOrCreateSeed } from './network';
import { deriveUnshieldedKeystore } from './wallet';

const { network, config } = resolveNetwork();
setNetworkId(config.networkId);

const address = deriveUnshieldedKeystore(
  getOrCreateSeed(network),
  getNetworkId(),
).getBech32Address();

/**
 * The subscription documents the installed SDK will actually send.
 *
 * Read out of wallet-sdk-indexer-client's generated gql module rather than
 * copied here, because a copy drifts: an SDK build that adds a field the
 * deployed indexer does not have is exactly the failure this is meant to
 * catch, and a hardcoded query would have kept passing while sync died.
 */
const findGqlModule = (): string => {
  const rel = join(
    '@midnight-ntwrk',
    'wallet-sdk-indexer-client',
    'dist',
    'graphql',
    'generated',
    'gql.js',
  );

  // Walk node_modules rather than resolve(): the package's "exports" map does
  // not expose this deep path, and npm may hoist it to the top level or nest
  // it under any dependent. The file is the source of truth either way.
  const roots = [resolve(process.cwd(), 'node_modules')];
  const direct = join(roots[0], rel);
  if (existsSync(direct)) return direct;

  const scope = join(roots[0], '@midnight-ntwrk');
  if (existsSync(scope)) {
    for (const pkg of readdirSync(scope)) {
      const nested = join(scope, pkg, 'node_modules', rel);
      if (existsSync(nested)) return nested;
    }
  }

  throw new Error(
    'Could not locate wallet-sdk-indexer-client. Run `npm install` and retry.',
  );
};

const loadSdkOperations = (): { name: string; query: string }[] => {
  const src = readFileSync(findGqlModule(), 'utf8');
  const wanted = ['ZswapEvents', 'DustLedgerEvents', 'UnshieldedTransactions'];
  const ops: { name: string; query: string }[] = [];

  for (const name of wanted) {
    // Keys are string literals holding the document, in either quote style,
    // with newlines escaped as \n by the generator.
    const at = src.indexOf(`subscription ${name}`);
    if (at < 0) continue;

    const quote = ['"', "'", '`']
      .map((q) => ({ q, i: src.lastIndexOf(q, at) }))
      .filter((c) => c.i >= 0)
      .sort((a, b) => b.i - a.i)[0];
    if (!quote) continue;

    const close = src.indexOf(quote.q, at);
    if (close < 0) continue;

    const query = src
      .slice(quote.i + 1, close)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"');
    ops.push({ name, query });
  }
  return ops;
};

const OPS: { name: string; query: string; variables: Record<string, unknown> }[] =
  loadSdkOperations().map((op) => ({
    ...op,
    variables:
      op.name === 'UnshieldedTransactions'
        ? { address, transactionId: 0 }
        : { id: 0 },
  }));

type Outcome = { ok: boolean; detail: string };

const runOp = (op: (typeof OPS)[number]): Promise<Outcome> =>
  new Promise((resolve) => {
    const ws = new WebSocket(config.indexerWS, 'graphql-transport-ws');
    let settled = false;
    const done = (r: Outcome) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* closing */ }
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: false, detail: 'no response within 25s' }), 25_000);

    ws.on('open', () => ws.send(JSON.stringify({ type: 'connection_init', payload: {} })));

    ws.on('message', (raw: Buffer) => {
      let msg: { type?: string; payload?: unknown };
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'connection_ack') {
        ws.send(JSON.stringify({
          id: '1',
          type: 'subscribe',
          payload: { query: op.query, variables: op.variables },
        }));
        return;
      }
      if (msg.type === 'next') {
        clearTimeout(timer);
        done({ ok: true, detail: JSON.stringify((msg.payload as { data?: unknown })?.data).slice(0, 200) });
        return;
      }
      if (msg.type === 'error') {
        clearTimeout(timer);
        done({ ok: false, detail: JSON.stringify(msg.payload).slice(0, 400) });
        return;
      }
    });

    ws.on('error', (e: Error) => { clearTimeout(timer); done({ ok: false, detail: e.message }); });
    ws.on('close', (code: number) => { clearTimeout(timer); done({ ok: false, detail: `closed (${code})` }); });
  });

console.log(`\n  Wallet subscription diagnosis — ${network}`);
console.log(`  ${config.indexerWS}`);
console.log(`  address ${address}\n`);

let anyFailed = false;
for (const op of OPS) {
  process.stdout.write(`  ${op.name} … `);
  const r = await runOp(op);
  if (r.ok) {
    console.log(`✓\n      ${r.detail}`);
  } else {
    anyFailed = true;
    console.log(`✗\n      ${r.detail}`);
  }
}

console.log('\n  ── verdict ─────────────────────────────────────────────');
if (OPS.length === 0) {
  console.log('  Could not read any subscription from the installed SDK, so');
  console.log('  nothing was tested. This is a bug in the diagnostic, not a');
  console.log('  finding about the network.\n');
  process.exit(2);
}
if (anyFailed) {
  console.log('  At least one wallet subscription is rejected by this indexer.');
  console.log('  That is why sync never starts. If the errors mention unknown');
  console.log('  fields or types, the SDK and the network are on different');
  console.log('  schema versions — no Node version or retry will fix it.\n');
  process.exit(1);
}
console.log('  All wallet subscriptions work. The SDK can sync against this');
console.log('  indexer, so the fault is in how the wallet is configured or');
console.log('  started rather than in the network.\n');
