/**
 * Check wallet balance on the local Midnight devnet
 */
import { WebSocket } from 'ws';
import { inspect } from 'node:util';

// Midnight SDK imports
import { resolveNetwork, getOrCreateSeed } from './network';
// unshieldedToken is re-exported from ./wallet (originally @midnight-ntwrk/midnight-js-protocol/ledger).
import { createWallet, persistWalletState, unshieldedToken } from './wallet';
import { reportSyncProgress } from './sync-progress';

// Enable WebSocket for GraphQL subscriptions
// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

// ─── Network configuration ─────────────────────────────────────────────────────

const { network, config: networkConfig } = resolveNetwork();
const SEED = getOrCreateSeed(network);

// ─── Main ──────────────────────────────────────────────────────────────────────

/**
 * The wallet SDK surfaces failures as Effect-tagged objects rather than Errors,
 * so `String(err)` and `err.message` both collapse to "[object Object]". Dig out
 * something actionable instead.
 */
function describeError(error: unknown): string {
  if (error instanceof Error && error.message && error.message !== '[object Object]') {
    return error.message;
  }
  return inspect(error, { depth: 4, colors: false });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                   Wallet Balance Checker                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('  Building wallet...');
    const walletCtx = await createWallet({ network, networkConfig, seed: SEED });
    const restoredCount = Object.values(walletCtx.restored).filter(Boolean).length;
    if (restoredCount > 0) {
      console.log(`  Restored ${restoredCount}/3 child wallets from .midnight-wallet-state — sync will resume from saved point.`);
    }

    // Print this before syncing: it is derived from the seed, so it is already
    // known, and on a fresh public-network wallet the sync below can take a
    // long time. Anyone who just needs a faucet target can stop reading here.
    const address = walletCtx.unshieldedKeystore.getBech32Address();
    console.log(`\n  Address: ${address}`);
    console.log(`  Network: ${networkConfig.networkId}`);
    if (networkConfig.faucet) {
      console.log(`  Faucet:  ${networkConfig.faucet}`);
    }
    console.log('');

    console.log('  Syncing with network...');
    console.log('  ℹ  This may take several minutes depending on network size.');
    console.log('     RPC disconnection messages during sync are normal and can be safely ignored.\n');
    const reporter = reportSyncProgress(walletCtx.wallet);
    let state;
    try {
      state = await walletCtx.wallet.waitForSyncedState();
    } catch (err) {
      reporter.stop();
      console.error(`\n❌ Sync failed at: ${reporter.summary()}`);
      throw err;
    }
    reporter.stop();
    console.log('  ✓ Synced with network.\n');

    const tNightBalance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
    const dustBalance = state.dust.balance(new Date());

    console.log('─── Balances ───────────────────────────────────────────────────\n');
    console.log(`  tNight: ${tNightBalance.toLocaleString()}`);
    console.log(`  DUST:   ${dustBalance.toLocaleString()}\n`);

    if (tNightBalance === 0n) {
      if (network === 'undeployed') {
        console.log('  ⚠ Wallet has no tNight. Make sure the local devnet is running');
        console.log('     (npm run setup) — the genesis seed is pre-funded by the dev preset.\n');
      } else if (networkConfig.faucet) {
        console.log(`  ⚠ Wallet has no tNight. Fund it from the faucet:`);
        console.log(`     ${networkConfig.faucet}`);
        console.log(`     Wallet address: ${address}\n`);
      } else {
        console.log('  ⚠ Wallet has no tNight.\n');
      }
    } else {
      console.log('  ✅ Wallet is funded and ready!\n');
    }

    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
  } catch (error) {
    console.error('\n❌ Error:', describeError(error));
    process.exit(1);
  }
}

main();
