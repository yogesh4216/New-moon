import React from 'react';
import type { MidnightState } from '../hooks/useMidnight';

interface WalletConnectProps {
  midnight: MidnightState;
}

/** Actionable guidance per failure mode, rather than a raw error string. */
const hintFor = (kind: MidnightState['errorKind']): string | null => {
  switch (kind) {
    case 'not-installed':
      return 'Install the Lace wallet browser extension, then reload this page.';
    case 'rejected':
      return 'Approve the connection request in the Lace popup to continue.';
    case 'network-mismatch':
      return 'Open Lace → Settings → Network and select the network shown above.';
    case 'disconnected':
      return 'Reopen Lace, unlock it, and connect again.';
    default:
      return null;
  }
};

export const WalletConnect: React.FC<WalletConnectProps> = ({ midnight }) => {
  const { isConnected, isConnecting, address, error, errorKind, walletInstalled, networkId } =
    midnight;
  const hint = hintFor(errorKind);

  return (
    <div className="glass-panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Lace Wallet</h2>
          <div className="status-badge">
            <span className={`status-indicator ${isConnected ? 'connected' : ''}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
            <span className="network-pill">{networkId}</span>
          </div>
        </div>

        {isConnected ? (
          <button className="btn btn-disconnect" onClick={midnight.disconnect}>
            Disconnect
          </button>
        ) : (
          <button className="btn" onClick={midnight.connect} disabled={isConnecting}>
            {isConnecting ? (
              <>
                <span className="loading-spinner" />
                Connecting…
              </>
            ) : (
              'Connect Wallet'
            )}
          </button>
        )}
      </div>

      {!walletInstalled && !isConnected && (
        <div className="notice notice-warn">
          No Midnight wallet detected in this browser.{' '}
          <a href="https://www.lace.io/" target="_blank" rel="noreferrer noopener">
            Install Lace
          </a>{' '}
          and reload.
        </div>
      )}

      {error && (
        <div className="notice notice-error">
          <strong>⚠️ {error}</strong>
          {hint && <div className="notice-hint">{hint}</div>}
        </div>
      )}

      {isConnected && address && (
        <div className="address-block">
          <p className="label">Wallet address</p>
          <p className="mono-value">{address}</p>
        </div>
      )}
    </div>
  );
};
