/**
 * Runs the exact GraphQL subscriptions the wallet SDK uses, one at a time, and
 * reports which succeed.
 *
 * `diagnose-indexer` subscribes to `blocks`, which proves the indexer is alive
 * but not that it serves the *wallet's* operations. These are the real ones:
 * `UnshieldedTransactions` is what yields `highestTransactionId`, the value
 * whose staying at 0 means sync never starts.
 */
import { Buffer } from 'buffer';
import { WebSocket } from 'ws';
import { HDWallet, Roles, createKeystore } from '@midnight-ntwrk/wallet-sdk';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { resolveNetwork, getOrCreateSeed } from './network';

const { network, config } = resolveNetwork();
setNetworkId(config.networkId);

const seed = getOrCreateSeed(network);
const hd = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
if (hd.type !== 'seedOk') throw new Error('invalid seed');
const derived = hd.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);
if (derived.type !== 'keysDerived') throw new Error('key derivation failed');
hd.hdWallet.clear();
const address = createKeystore(derived.keys[Roles.NightExternal], getNetworkId()).getBech32Address();

const OPS: { name: string; query: string; variables: Record<string, unknown> }[] = [
  {
    name: 'ZswapEvents',
    query: `subscription ZswapEvents($id: Int) {
      zswapLedgerEvents(id: $id) { id raw protocolVersion maxId }
    }`,
    variables: { id: 0 },
  },
  {
    name: 'DustLedgerEvents',
    query: `subscription DustLedgerEvents($id: Int) {
      dustLedgerEvents(id: $id) { type: __typename id raw maxId }
    }`,
    variables: { id: 0 },
  },
  {
    name: 'UnshieldedTransactions',
    query: `subscription UnshieldedTransactions($address: UnshieldedAddress!, $transactionId: Int) {
      unshieldedTransactions(address: $address, transactionId: $transactionId) {
        ... on UnshieldedTransactionsProgress { type: __typename highestTransactionId }
      }
    }`,
    variables: { address, transactionId: 0 },
  },
];

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
