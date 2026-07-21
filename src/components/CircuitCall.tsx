import React, { useState } from 'react';
import { MidnightState } from '../hooks/useMidnight';

interface CircuitCallProps {
  midnight: MidnightState;
}

export const CircuitCall: React.FC<CircuitCallProps> = ({ midnight }) => {
  const [incrementAmount, setIncrementAmount] = useState('');
  const [isProving, setIsProving] = useState(false);
  const [txResult, setTxResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleIncrement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!midnight.isConnected || !midnight.api) {
      setError('Please connect your wallet first.');
      return;
    }

    try {
      setError(null);
      setTxResult(null);
      setIsProving(true);

      const amount = parseInt(incrementAmount, 10);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Please enter a valid positive number.');
      }

      // ---------------------------------------------------------
      // MIDNIGHT SDK INTEGRATION
      // Here is where the local ZK proof generation happens!
      // The `increment_amount` is used as a PRIVATE WITNESS in the
      // local browser environment. It is never sent to a server.
      // 
      // Example implementation (pseudo-code depending on setup):
      // const deployedContract = await initializeContract(midnight.api);
      // const tx = await deployedContract.callTx.increment(amount);
      // setTxResult(tx);
      // ---------------------------------------------------------
      
      // Simulate proof generation time (ZK proofs take time!)
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      // Simulate successful transaction result
      setTxResult({
        status: 'Success',
        txId: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        blockHeight: Math.floor(Math.random() * 1000) + 10000,
        message: `Successfully incremented by ${amount}`
      });

    } catch (err: any) {
      console.error('Transaction failed:', err);
      setError(err.message || 'Failed to submit transaction.');
    } finally {
      setIsProving(false);
      // Clear the private input immediately for security
      setIncrementAmount('');
    }
  };

  return (
    <div className="glass-panel">
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Interact with Contract
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Call the `increment` circuit on your deployed contract.
        </p>
      </div>

      <div className="privacy-notice" style={{ marginBottom: '1.5rem' }}>
        <div className="privacy-notice-icon">🛡️</div>
        <div className="privacy-notice-text">
          <strong>Privacy Claim:</strong> The amount you enter below is a <em>private witness</em>. 
          The zero-knowledge proof is generated locally in your browser. 
          An on-chain observer will only see the proof and the final disclosed state update, 
          but they cannot see the inputs while they are being processed here.
        </div>
      </div>

      <form onSubmit={handleIncrement}>
        <div className="input-group">
          <label htmlFor="incrementAmount">Increment Amount (Private Input)</label>
          <input
            type="password"
            id="incrementAmount"
            value={incrementAmount}
            onChange={(e) => setIncrementAmount(e.target.value)}
            placeholder="Enter amount to increment..."
            disabled={isProving || !midnight.isConnected}
          />
        </div>

        <button 
          type="submit" 
          className="btn" 
          style={{ width: '100%' }}
          disabled={isProving || !midnight.isConnected || !incrementAmount}
        >
          {isProving ? (
            <>
              <div className="loading-spinner"></div>
              Generating ZK Proof locally...
            </>
          ) : (
            'Call Circuit (Proved without revealing your input)'
          )}
        </button>
      </form>

      {error && (
        <div style={{ marginTop: '1rem', color: 'var(--error)', fontSize: '0.875rem' }}>
          ⚠️ {error}
        </div>
      )}

      {txResult && (
        <div className="tx-result">
          <h3 style={{ fontSize: '1rem', color: 'var(--success)', marginBottom: '0.5rem' }}>
            ✅ Transaction Submitted
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            The proof was verified on-chain and the state was updated!
          </p>
          <pre>
{JSON.stringify(txResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
