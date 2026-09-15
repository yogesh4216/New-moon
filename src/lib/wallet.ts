import type { ConnectedAPI, InitialAPI, APIError } from '@midnight-ntwrk/dapp-connector-api';
import { ErrorCodes } from '@midnight-ntwrk/dapp-connector-api';

/** Error classes the UI reacts to differently. */
export type WalletErrorKind =
  | 'not-installed'
  | 'rejected'
  | 'network-mismatch'
  | 'disconnected'
  | 'unknown';

export class WalletError extends Error {
  constructor(
    readonly kind: WalletErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

const isAPIError = (e: unknown): e is APIError =>
  typeof e === 'object' && e !== null && (e as { type?: string }).type === 'DAppConnectorAPIError';

/**
 * Wallets inject one or more {@link InitialAPI} instances under `window.midnight`,
 * keyed by an arbitrary id. Lace uses `mnLace`, but the key is not guaranteed,
 * so fall back to scanning for anything that looks like a connector.
 */
export const discoverWallet = (): InitialAPI | null => {
  const injected = window.midnight;
  if (!injected) return null;

  const lace = injected.mnLace;
  if (lace && typeof lace.connect === 'function') return lace;

  const first = Object.values(injected).find((api) => typeof api?.connect === 'function');
  return first ?? null;
};

export const isWalletInstalled = (): boolean => discoverWallet() !== null;

/**
 * Connect to the injected wallet and verify it is on the network this dApp
 * targets. Translates connector errors into {@link WalletError} so the UI can
 * show something a user can act on.
 */
export const connectWallet = async (expectedNetworkId: string): Promise<ConnectedAPI> => {
  const connector = discoverWallet();
  if (!connector) {
    throw new WalletError(
      'not-installed',
      'No Midnight wallet detected. Install the Lace wallet extension and reload this page.',
    );
  }

  let api: ConnectedAPI;
  try {
    api = await connector.connect(expectedNetworkId);
  } catch (e) {
    if (isAPIError(e)) {
      if (e.code === ErrorCodes.Rejected || e.code === ErrorCodes.PermissionRejected) {
        throw new WalletError('rejected', 'You rejected the connection request in your wallet.');
      }
      if (e.code === ErrorCodes.Disconnected) {
        throw new WalletError('disconnected', 'The wallet disconnected before the request completed.');
      }
      throw new WalletError('unknown', e.reason || e.message);
    }
    throw new WalletError('unknown', e instanceof Error ? e.message : String(e));
  }

  // `connect(networkId)` is a hint, not a guarantee — the wallet may already be
  // on a different network. Verify before letting the user sign anything.
  const status = await api.getConnectionStatus();
  if (status.status !== 'connected') {
    throw new WalletError('disconnected', 'The wallet reported a disconnected state.');
  }
  if (status.networkId !== expectedNetworkId) {
    throw new WalletError(
      'network-mismatch',
      `Wallet is on "${status.networkId}" but this dApp targets "${expectedNetworkId}". ` +
        `Switch networks in Lace and reconnect.`,
    );
  }

  return api;
};

/** Best-effort display address. Prefers the shielded address. */
export const readAddress = async (api: ConnectedAPI): Promise<string> => {
  try {
    const { shieldedAddress } = await api.getShieldedAddresses();
    if (shieldedAddress) return shieldedAddress;
  } catch {
    // fall through to unshielded
  }
  const { unshieldedAddress } = await api.getUnshieldedAddress();
  return unshieldedAddress;
};
