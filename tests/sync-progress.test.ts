import { test } from 'node:test';
import assert from 'node:assert';
import { toNum, formatPct, reportSyncProgress } from '../src/sync-progress';

test('toNum accepts the shapes the SDK actually returns', () => {
  // Declared bigint, but observed as a plain number at runtime — mixing the
  // two in arithmetic is what crashed an earlier version of this reporter.
  assert.equal(toNum(42), 42);
  assert.equal(toNum(42n), 42);
  assert.equal(toNum('42'), 42);
  assert.equal(toNum(undefined), 0);
  assert.equal(toNum(null), 0);
  assert.equal(toNum('nonsense'), 0);
  assert.equal(toNum(NaN), 0);
  assert.equal(toNum(Infinity), 0);
});

test('formatPct never throws on mixed numeric types', () => {
  assert.equal(formatPct({ appliedId: 50, highestTransactionId: 100, isConnected: true }), '50.0%');
  assert.equal(formatPct({ appliedId: 50n, highestTransactionId: 100, isConnected: true }), '50.0%');
  assert.equal(formatPct({ appliedId: 50, highestTransactionId: 100n, isConnected: true }), '50.0%');
  assert.equal(formatPct({ appliedId: '50', highestTransactionId: '100', isConnected: true }), '50.0%');
});

test('formatPct shows raw counters when the chain height is unknown', () => {
  // "0/0" is deliberate: an unknown height means sync has not started, which is
  // a different condition from a slow sync and must not look like a rounding
  // artifact.
  assert.equal(formatPct({ appliedId: 5, highestTransactionId: 0, isConnected: true }), '5/0');
  assert.equal(formatPct({ appliedId: 0, highestTransactionId: 0, isConnected: true }), '0/0');
  assert.equal(formatPct({ appliedId: 0, highestTransactionId: undefined, isConnected: true }), '0/0');
});

test('formatPct clamps overshoot', () => {
  assert.equal(formatPct({ appliedId: 150, highestTransactionId: 100, isConnected: true }), '100.0%');
});

test('the reporter survives a state observable that emits junk', () => {
  const subscribers: ((v: unknown) => void)[] = [];
  const wallet = {
    state: () => ({
      subscribe: (o: { next: (v: unknown) => void }) => {
        subscribers.push(o.next);
        return { unsubscribe() {} };
      },
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reporter = reportSyncProgress(wallet as any, { intervalMs: 10_000 });

  // A mix of plain numbers and bigints across children is the real-world case.
  assert.doesNotThrow(() => {
    subscribers[0]({
      shielded: { progress: { appliedId: 10, highestTransactionId: 100, isConnected: true } },
      unshielded: { progress: { appliedId: 20n, highestTransactionId: 100n, isConnected: true } },
      dust: { progress: { appliedId: '30', highestTransactionId: '100', isConnected: false } },
    });
  });
  assert.match(reporter.summary(), /shielded 10\/100/);
  assert.match(reporter.summary(), /unshielded 20\/100/);

  assert.doesNotThrow(() => subscribers[0](null));
  assert.doesNotThrow(() => subscribers[0]({ shielded: undefined }));

  reporter.stop();
});

test('reporter.summary() is safe before any state arrives', () => {
  const wallet = { state: () => ({ subscribe: () => ({ unsubscribe() {} }) }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reporter = reportSyncProgress(wallet as any, { intervalMs: 10_000 });
  assert.equal(reporter.summary(), 'no progress reported');
  reporter.stop();
});

test('the reporter does not throw when state() itself is broken', () => {
  const wallet = { state: () => { throw new Error('observable unavailable'); } };
  assert.doesNotThrow(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = reportSyncProgress(wallet as any, { intervalMs: 10_000 });
    r.stop();
  });
});
