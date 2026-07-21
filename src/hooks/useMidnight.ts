import { useState, useEffect, useCallback } from 'react';
import { DAppConnectorAPI } from '@midnight-ntwrk/dapp-connector-api';

export interface MidnightState {
  isConnected: boolean;
  address: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  api: any | null; // Wallet API instance from Lace
}

export function useMidnight(): MidnightState {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [api, setApi] = useState<any | null>(null);

  const connect = useCallback(async () => {
    try {
      setError(null);
      // Check if Midnight Lace is injected
      const midnightObj = (window as any).midnight;
      if (!midnightObj || !midnightObj.mnLace) {
        throw new Error('Lace wallet with Midnight network support is not installed.');
      }

      // Request connection to Lace
      const laceConnector = midnightObj.mnLace as DAppConnectorAPI;
      const isEnabled = await laceConnector.isEnabled();
      
      const walletApi = await laceConnector.enable();
      
      if (!walletApi) {
        throw new Error('User rejected the connection request.');
      }

      // Assuming state returns an address or we can get it from the API
      // Note: The specific method to get the address depends on the current wallet API version.
      // Usually, it's `walletApi.state().address` or similar, which is an observable.
      const state = await walletApi.state();
      
      setApi(walletApi);
      setAddress(state.address || 'Connected Address Hidden/TBD');
      setIsConnected(true);

    } catch (err: any) {
      console.error('Failed to connect to Midnight:', err);
      setError(err.message || 'An unknown error occurred during connection.');
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setAddress(null);
    setApi(null);
    setError(null);
  }, []);

  // Optionally auto-check on mount
  useEffect(() => {
    const checkConnection = async () => {
      const midnightObj = (window as any).midnight;
      if (midnightObj?.mnLace) {
        const isEnabled = await midnightObj.mnLace.isEnabled();
        if (isEnabled) {
          // You could automatically re-enable here, but for security 
          // it's often better to wait for a user click.
        }
      }
    };
    checkConnection();
  }, []);

  return {
    isConnected,
    address,
    error,
    connect,
    disconnect,
    api
  };
}
