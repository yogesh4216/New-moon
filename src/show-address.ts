/**
 * Prints the wallet address for the active network — no network I/O.
 *
 * The address is derived from the seed, so it is known before any chain sync.
 * `check-balance` only prints it after `waitForSyncedState()` resolves, which
 * on a fresh public-network wallet can take a very long time; when all you need
 * is somewhere to point the faucet, use this instead.
 */
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { resolveNetwork, getOrCreateSeed } from './network';
import { deriveUnshieldedKeystore } from './wallet';

const { network, config } = resolveNetwork();
setNetworkId(config.networkId);

const address = deriveUnshieldedKeystore(
  getOrCreateSeed(network),
  getNetworkId(),
).getBech32Address();

process.stdout.write(`
  Network: ${network}
  Address: ${address}
`);
if (config.faucet) {
  process.stdout.write(`  Faucet:  ${config.faucet}\n`);
}
process.stdout.write('\n');
