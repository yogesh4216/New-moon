import React, { useCallback, useEffect, useState } from 'react';
import type { MidnightState } from '../hooks/useMidnight';
import { callIncrement, readCount, type IncrementResult } from '../lib/counterContract';
import { CONTRACT_ADDRESS, isContractConfigured } from '../config';

interface CircuitCallProps {
  midnight: MidnightState;
}

type Phase = 'idle' | 'working';

export const CircuitCall: React.FC<CircuitCallProps> = ({ midnight }) => {
  // Held only for the duration of the call, then cleared. Never rendered back,
  // never logged, never included in the result panel.
  const [amount, setAmount] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<IncrementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publicCount, setPublicCount] = useState<bigint | null>(null);

  const configured = isContractConfigured();
  const busy = phase !== 'idle';

  const refreshCount = useCallback(async () => {
    if (!midnight.providers || !configured) return;
    try {
      setPublicCount(await readCount(midnight.providers));
    } catch {
      setPublicCount(null);
    }
  }, [midnight.providers, configured]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!midnight.isConnected || !midnight.providers) {
      setError('Connect your Lace wallet first.');
      return;
    }
    if (!configured) {
      setError('No contract address configured. Set VITE_CONTRACT_ADDRESS and rebuild.');
      return;
    }

    const parsed = Number(amount);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 4294967295) {
      setError('Enter a whole number between 1 and 4294967295.');
      return;
    }

    try {
      setPhase('working');
      // Proving and submission both happen inside this call: the wallet proves
      // locally, balances the transaction, then relays it to the network.
      const res = await callIncrement(midnight.providers, BigInt(parsed));
      setResult(res);
      setPublicCount(res.countAfter);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhase('idle');
      setAmount(''); // clear the private input as soon as the call ends
    }
  };

  return (
    <div className="glass-panel">
      <div className="panel-head-block">
        <h2 className="panel-title">Call the <code>increment</code> circuit</h2>
        <p className="panel-sub">
          Contract <span className="mono-inline">{CONTRACT_ADDRESS || 'not configured'}</span> on{' '}
          {midnight.networkId}
        </p>
      </div>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Public counter (on-chain)</span>
          <span className="stat-value">{publicCount === null ? '—' : publicCount.toString()}</span>
        </div>
      </div>

      <div className="privacy-notice">
        <div className="privacy-notice-icon">🛡️</div>
        <div className="privacy-notice-text">
          The amount below is a <strong>private circuit input</strong>. The zero-knowledge proof is
          generated on this device by your Lace wallet. It is never displayed here after you submit,
          never logged, and never sent to any server we run.
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label htmlFor="amount">Increment amount (private input)</label>
          <input
            id="amount"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter an amount…"
            disabled={busy || !midnight.isConnected}
          />
        </div>

        <button
          type="submit"
          className="btn btn-full"
          disabled={busy || !midnight.isConnected || !amount || !configured}
        >
          {busy ? (
            <>
              <span className="loading-spinner" />
              Generating proof locally, then submitting…
            </>
          ) : (
            'Call circuit'
          )}
        </button>
        <p className="proof-label">Proved without revealing your input</p>
      </form>

      {error && (
        <div className="notice notice-error">
          <strong>⚠️ {error}</strong>
        </div>
      )}

      {result && (
        <div className="tx-result">
          <h3 className="tx-result-title">✅ Transaction submitted</h3>
          <dl className="tx-grid">
            <dt>Transaction hash</dt>
            <dd className="mono-value">{result.txHash || '—'}</dd>
            <dt>Transaction id</dt>
            <dd className="mono-value">{result.txId || '—'}</dd>
            <dt>Block height</dt>
            <dd>{result.blockHeight ?? '—'}</dd>
            <dt>Public counter after</dt>
            <dd>{result.countAfter?.toString() ?? '—'}</dd>
          </dl>
          <p className="tx-note">
            Your input is not in this panel, and it is not in the transaction — only the proof and
            the resulting public state are on-chain.
          </p>
        </div>
      )}
    </div>
  );
};
