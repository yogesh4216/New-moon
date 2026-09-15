/**
 * Prints the wallet address for the active network — no network I/O.
 *
 * The address is derived from the seed, so it is known before any chain sync.
 * `check-balance` only prints it after `waitForSyncedState()` resolves, which
 * on a fresh public-network wallet can take a very long time; when all you need
 * is somewhere to point the faucet, use this instead.
 */
import { Buffer } from 'buffer';
import { HDWallet, Roles, createKeystore } from '@midnight-ntwrk/wallet-sdk';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { resolveNetwork, getOrCreateSeed } from './network';

const { network, config } = resolveNetwork();
const seed = getOrCreateSeed(network);

setNetworkId(config.networkId);

const hd = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
if (hd.type !== 'seedOk') {
  process.stderr.write('Invalid seed in .midnight-state.json\n');
  process.exit(1);
}

const derived = hd.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);
if (derived.type !== 'keysDerived') {
  process.stderr.write('Key derivation failed\n');
  process.exit(1);
}
hd.hdWallet.clear();

const address = createKeystore(derived.keys[Roles.NightExternal], getNetworkId()).getBech32Address();

process.stdout.write(`
  Network: ${network}
  Address: ${address}
`);
if (config.faucet) {
  process.stdout.write(`  Faucet:  ${config.faucet}\n`);
}
process.stdout.write('\n');
