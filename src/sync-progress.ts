/**
 * Live sync reporting for the wallet facade.
 *
 * `waitForSyncedState()` is opaque: it either resolves or it does not, so a
 * long sync is indistinguishable from a stuck one. Each child wallet exposes
 * `progress` with `appliedId`, `highestTransactionId` and `isConnected`, which
 * is enough to show how far along each one is and to notice when nothing has
 * moved for a while.
 */
import type { Observable, Subscription } from 'rxjs';

type ChildProgress = {
  appliedId: bigint;
  highestTransactionId: bigint;
  isConnected: boolean;
};

/**
 * Structural, not nominal: each child wallet package declares its own state
 * class, and we only ever read `progress` off them.
 */
type FacadeLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state(): Observable<any>;
};

const KINDS = ['shielded', 'unshielded', 'dust'] as const;
type Kind = (typeof KINDS)[number];

const pct = (p: ChildProgress): string => {
  if (p.highestTransactionId <= 0n) return '—';
  const ratio = Number((p.appliedId * 1000n) / p.highestTransactionId) / 10;
  return `${Math.min(ratio, 100).toFixed(1)}%`;
};

export interface SyncReporter {
  /** Stop reporting and clear the status line. */
  stop(): void;
  /** Human-readable last known position, for error messages. */
  summary(): string;
}

export const reportSyncProgress = (
  wallet: FacadeLike,
  opts: { stallWarningMs?: number } = {},
): SyncReporter => {
  const stallWarningMs = opts.stallWarningMs ?? 120_000;
  const start = Date.now();

  const latest: Partial<Record<Kind, ChildProgress>> = {};
  let lastAppliedTotal = -1n;
  let lastMovementAt = Date.now();
  let warnedStall = false;

  let sub: Subscription | undefined;
  try {
    sub = wallet.state().subscribe({
      next: (s: Record<string, { progress?: ChildProgress } | undefined>) => {
        for (const kind of KINDS) {
          const p = s?.[kind]?.progress;
          if (p) latest[kind] = p;
        }
      },
      error: () => undefined,
    });
  } catch {
    // If the observable is unavailable we still show elapsed time below.
  }

  const render = () => {
    const elapsed = Math.round((Date.now() - start) / 1000);

    const parts: string[] = [];
    let appliedTotal = 0n;
    let connected = false;

    for (const kind of KINDS) {
      const p = latest[kind];
      if (!p) continue;
      appliedTotal += p.appliedId;
      connected = connected || p.isConnected;
      parts.push(`${kind[0]}:${pct(p)}`);
    }

    if (appliedTotal !== lastAppliedTotal) {
      lastAppliedTotal = appliedTotal;
      lastMovementAt = Date.now();
      warnedStall = false;
    }

    const detail = parts.length > 0 ? parts.join(' ') : 'waiting for first update';
    const link = parts.length > 0 ? (connected ? '' : ' [disconnected]') : '';
    process.stdout.write(`\r  ⏳ syncing ${elapsed}s — ${detail}${link}          `);

    const stalledFor = Date.now() - lastMovementAt;
    if (!warnedStall && stalledFor > stallWarningMs && parts.length > 0) {
      warnedStall = true;
      process.stdout.write(
        `\n  ⚠ No progress for ${Math.round(stalledFor / 1000)}s. ` +
          `If this persists the indexer or RPC may be unreachable — see DEPLOY.md.\n`,
      );
    }
  };

  const timer = setInterval(render, 5000);
  render();

  return {
    stop() {
      clearInterval(timer);
      sub?.unsubscribe();
      process.stdout.write('\r' + ' '.repeat(78) + '\r');
    },
    summary() {
      const parts = KINDS.filter((k) => latest[k]).map((k) => {
        const p = latest[k]!;
        return `${k} ${p.appliedId}/${p.highestTransactionId}`;
      });
      return parts.length > 0 ? parts.join(', ') : 'no progress reported';
    },
  };
};
