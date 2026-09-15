/**
 * Runtime configuration for the dApp.
 *
 * Everything here is PUBLIC by definition — it ships in the browser bundle.
 * Never put a seed, mnemonic, or private key behind a `VITE_` variable.
 */

/** Network the dApp expects the wallet to be connected to. */
export const NETWORK_ID = import.meta.env.VITE_NETWORK_ID ?? 'preprod';

/** Address of the deployed Counter contract on {@link NETWORK_ID}. */
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

/**
 * Where the compiled ZK artifacts (`keys/`, `zkir/`) are served from.
 * `managed/` is copied into `public/` at build time so the browser can fetch
 * the prover and verifier keys.
 */
export const ZK_CONFIG_BASE_URL =
  import.meta.env.VITE_ZK_CONFIG_BASE_URL ?? `${window.location.origin}/managed`;

/**
 * Fallback indexer URIs, used only if the wallet does not report its own via
 * `getConfiguration()`. The wallet's values always win — the user may have
 * chosen a specific indexer for privacy reasons.
 */
export const FALLBACK_INDEXER_URI =
  import.meta.env.VITE_INDEXER_URI ?? 'https://indexer.preprod.midnight.network/api/v4/graphql';
export const FALLBACK_INDEXER_WS_URI =
  import.meta.env.VITE_INDEXER_WS_URI ?? 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';

export const isContractConfigured = (): boolean => CONTRACT_ADDRESS.trim().length > 0;
