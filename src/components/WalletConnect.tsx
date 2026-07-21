import React from 'react';
import { MidnightState } from '../hooks/useMidnight';

interface WalletConnectProps {
  midnight: MidnightState;
}

export const WalletConnect: React.FC<WalletConnectProps> = ({ midnight }) => {
  const { isConnected, address, error, connect, disconnect } = midnight;

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Lace Wallet
          </h2>
          <div className="status-badge">
            <span className={`status-indicator ${isConnected ? 'connected' : ''}`}></span>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        
        {isConnected ? (
          <button className="btn btn-disconnect" onClick={disconnect}>
            Disconnect
          </button>
        ) : (
          <button className="btn" onClick={connect}>
            Connect Wallet
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '1rem', color: 'var(--error)', fontSize: '0.875rem' }}>
          ⚠️ {error}
        </div>
      )}

      {isConnected && address && (
        <div style={{ marginTop: '1.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Wallet Address:</p>
          <p style={{ fontFamily: 'monospace', wordBreak: 'break-all', marginTop: '0.25rem' }}>
            {address}
          </p>
        </div>
      )}
    </div>
  );
};
