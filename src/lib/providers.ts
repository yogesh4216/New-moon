import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import {
  createProofProvider,
  zkConfigToProvingKeyMaterial,
} from '@midnight-ntwrk/midnight-js-types';
import { Transaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { FALLBACK_INDEXER_URI, FALLBACK_INDEXER_WS_URI, ZK_CONFIG_BASE_URL } from '../config';

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
};

/**
 * Builds the Midnight.js provider set on top of a connected wallet.
 *
 * Two properties matter for the privacy claim:
 *
 *  - The **proof provider** is obtained via `wallet.getProvingProvider(...)`,
 *    so proving is delegated to the Lace extension running on the user's own
 *    machine. The circuit's private input is turned into a proof locally; it is
 *    never POSTed to a remote prover we control.
 *  - The **private state provider** is a browser-local LevelDB (IndexedDB).
 *    Private state never leaves the device.
 */
export const buildProviders = async (wallet: ConnectedAPI, accountId: string) => {
  // Let the wallet tell us which services to use — the user may have picked a
  // specific indexer for privacy reasons, and that choice should win.
  const config = await wallet.getConfiguration().catch(() => null);
  const indexerUri = config?.indexerUri ?? FALLBACK_INDEXER_URI;
  const indexerWsUri = config?.indexerWsUri ?? FALLBACK_INDEXER_WS_URI;

  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
    await wallet.getShieldedAddresses();

  const zkConfigProvider = new FetchZkConfigProvider<'increment' | 'initialize'>(
    ZK_CONFIG_BASE_URL,
    { fetchFunc: fetch.bind(window) },
  );

  // Proving happens inside the wallet, on this device.
  const walletProvingProvider = await wallet.getProvingProvider({
    getZKIR: (loc) => zkConfigProvider.getZKIR(loc as 'increment' | 'initialize'),
    getProverKey: (loc) => zkConfigProvider.getProverKey(loc as 'increment' | 'initialize'),
    getVerifierKey: (loc) => zkConfigProvider.getVerifierKey(loc as 'increment' | 'initialize'),
  });

  // ledger-v9's ProvingProvider adds `lookupKey`, which the DApp connector API
  // does not implement yet (absent from 4.0.1 and 4.1.0-beta.1 alike). Serve it
  // from the same ZK config the wallet is already being handed, so proving
  // still happens in the extension and only key material comes from here.
  const provingProvider = {
    check: walletProvingProvider.check.bind(walletProvingProvider),
    prove: walletProvingProvider.prove.bind(walletProvingProvider),
    lookupKey: async (keyLocation: string) => {
      try {
        const zkConfig = await zkConfigProvider.get(
          keyLocation as 'increment' | 'initialize',
        );
        return zkConfigToProvingKeyMaterial(zkConfig);
      } catch {
        // `undefined` is the documented "no key here" answer.
        return undefined;
      }
    },
  };

  return {
    // The default websocket impl resolves to `undefined` under a browser
    // bundler (isomorphic-ws has no named WebSocket export), which silently
    // breaks indexer subscriptions — pass the native one explicitly.
    publicDataProvider: indexerPublicDataProvider(
      indexerUri,
      indexerWsUri,
      WebSocket as never,
    ),
    zkConfigProvider,
    proofProvider: createProofProvider(provingProvider),
    privateStateProvider: levelPrivateStateProvider({
      accountId,
      // Private state is encrypted at rest in the browser. A production dApp
      // should prompt the user for this rather than deriving it.
      privateStoragePasswordProvider: () => accountId,
    }),
    walletProvider: {
      balanceTx: async (tx: unknown) => {
        const serialized = toHex((tx as { serialize(): Uint8Array }).serialize());
        const { tx: balanced } = await wallet.balanceUnsealedTransaction(serialized);
        return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balanced));
      },
      getCoinPublicKey: () => shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shieldedEncryptionPublicKey,
    },
    midnightProvider: {
      submitTx: async (tx: unknown) => {
        const serialized = toHex((tx as { serialize(): Uint8Array }).serialize());
        await wallet.submitTransaction(serialized);
        return (tx as { transactionHash(): string }).transactionHash();
      },
    },
  };
};
