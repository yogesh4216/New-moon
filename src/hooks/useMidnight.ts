import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  WalletError,
  type WalletErrorKind,
  connectWallet,
  isWalletInstalled,
  readAddress,
} from '../lib/wallet';
import { buildProviders } from '../lib/providers';
import { NETWORK_ID } from '../config';

export interface MidnightState {
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  networkId: string;
  walletInstalled: boolean;
  error: string | null;
  errorKind: WalletErrorKind | null;
  /** Midnight.js providers, available only while connected. */
  providers: unknown | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useMidnight(): MidnightState {
  const [wallet, setWallet] = useState<ConnectedAPI | null>(null);
  const [providers, setProviders] = useState<unknown | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<WalletErrorKind | null>(null);
  const [walletInstalled, setWalletInstalled] = useState(false);

  // Extensions inject on document load, which can land after React mounts.
  useEffect(() => {
    const check = () => setWalletInstalled(isWalletInstalled());
    check();
    const timer = window.setInterval(check, 500);
    const stop = window.setTimeout(() => window.clearInterval(timer), 5000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setProviders(null);
    setAddress(null);
    setError(null);
    setErrorKind(null);
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    setErrorKind(null);
    try {
      const api = await connectWallet(NETWORK_ID);

      // Ask up front for the permissions this dApp needs, so the user sees one
      // prompt rather than one per action mid-flow.
      await api
        .hintUsage([
          'getShieldedAddresses',
          'getConfiguration',
          'getProvingProvider',
          'balanceUnsealedTransaction',
          'submitTransaction',
        ])
        .catch(() => undefined);

      const walletAddress = await readAddress(api);
      const built = await buildProviders(api, walletAddress);

      setWallet(api);
      setAddress(walletAddress);
      setProviders(built);
    } catch (e) {
      const we =
        e instanceof WalletError
          ? e
          : new WalletError('unknown', e instanceof Error ? e.message : String(e));
      setError(we.message);
      setErrorKind(we.kind);
      setWallet(null);
      setProviders(null);
      setAddress(null);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Drop local state if the wallet disconnects or switches networks under us.
  useEffect(() => {
    if (!wallet) return;
    const poll = window.setInterval(async () => {
      try {
        const status = await wallet.getConnectionStatus();
        if (status.status !== 'connected') {
          disconnect();
          setError('The wallet disconnected.');
          setErrorKind('disconnected');
        } else if (status.networkId !== NETWORK_ID) {
          disconnect();
          setError(
            `Wallet switched to "${status.networkId}" but this dApp targets "${NETWORK_ID}".`,
          );
          setErrorKind('network-mismatch');
        }
      } catch {
        // transient; next tick will retry
      }
    }, 4000);
    return () => window.clearInterval(poll);
  }, [wallet, disconnect]);

  return useMemo(
    () => ({
      isConnected: wallet !== null && providers !== null,
      isConnecting,
      address,
      networkId: NETWORK_ID,
      walletInstalled,
      error,
      errorKind,
      providers,
      connect,
      disconnect,
    }),
    [wallet, providers, isConnecting, address, walletInstalled, error, errorKind, connect, disconnect],
  );
}
