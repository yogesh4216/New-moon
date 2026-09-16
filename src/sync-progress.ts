/**
 * Live sync reporting for the wallet facade.
 *
 * `waitForSyncedState()` is opaque: it either resolves or it does not, so a
 * long sync is indistinguishable from a stuck one. Each child wallet exposes
 * `progress` with `appliedId`, `highestTransactionId` and `isConnected`, which
 * is enough to show how far along each one is and to notice when nothing has
 * moved for a while.
 *
 * Two rules this module follows, both learned the hard way:
 *
 *  - Never do BigInt arithmetic on these values. They are *declared* bigint but
 *    arrive as plain numbers at runtime, and `0n + 1` throws a TypeError.
 *    Everything is coerced through `toNum` and kept in Number space; this is a
 *    progress bar, so the precision loss past 2^53 does not matter.
 *  - Never let reporting break the thing being reported on. `render` is a
 *    cosmetic side effect running on a timer — if it throws, the deploy dies
 *    with a stack trace from the progress bar rather than a real error. It is
 *    wrapped, and a persistent failure disables reporting rather than the sync.
 */
import type { Observable, Subscription } from 'rxjs';

type ChildProgress = {
  appliedId: unknown;
  highestTransactionId: unknown;
  isConnected: unknown;
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

/** Accepts bigint, number or numeric string; anything else becomes 0. */
export const toNum = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

/**
 * Percentage applied once the chain height is known.
 *
 * While the height is still 0 this shows the raw counters instead. That case
 * is not "slow" — it means the wallet has not learned the chain height at all,
 * so sync cannot advance. Showing "0/0" makes that obvious; an earlier version
 * printed a bare em dash, which read like a rounding artifact.
 */
export const formatPct = (p: ChildProgress): string => {
  const applied = toNum(p.appliedId);
  const highest = toNum(p.highestTransactionId);
  if (highest <= 0) return `${applied}/0`;
  return `${Math.min((applied / highest) * 100, 100).toFixed(1)}%`;
};

/** True when no child wallet has learned the chain height yet. */
const noChainHeight = (states: ChildProgress[]): boolean =>
  states.length > 0 && states.every((p) => toNum(p.highestTransactionId) <= 0);

export interface SyncReporter {
  /** Stop reporting and clear the status line. */
  stop(): void;
  /** Human-readable last known position, for error messages. */
  summary(): string;
}

export const reportSyncProgress = (
  wallet: FacadeLike,
  opts: { stallWarningMs?: number; intervalMs?: number } = {},
): SyncReporter => {
  const stallWarningMs = opts.stallWarningMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 5000;
  const start = Date.now();

  const latest: Partial<Record<Kind, ChildProgress>> = {};
  let lastAppliedTotal = -1;
  let lastMovementAt = Date.now();
  let warnedStall = false;
  let renderFailures = 0;

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

  const renderOnce = () => {
    const elapsed = Math.round((Date.now() - start) / 1000);

    const parts: string[] = [];
    const seen: ChildProgress[] = [];
    let appliedTotal = 0;
    let connected = false;

    for (const kind of KINDS) {
      const p = latest[kind];
      if (!p) continue;
      seen.push(p);
      appliedTotal += toNum(p.appliedId);
      connected = connected || p.isConnected === true;
      parts.push(`${kind[0]}:${formatPct(p)}`);
    }

    if (appliedTotal !== lastAppliedTotal) {
      lastAppliedTotal = appliedTotal;
      lastMovementAt = Date.now();
      warnedStall = false;
    }

    const detail = parts.length > 0 ? parts.join(' ') : 'waiting for first update';
    const link = parts.length > 0 && !connected ? ' [disconnected]' : '';
    process.stdout.write(`\r  ⏳ syncing ${elapsed}s — ${detail}${link}          `);

    const stalledFor = Date.now() - lastMovementAt;
    if (!warnedStall && stalledFor > stallWarningMs && parts.length > 0) {
      warnedStall = true;
      if (noChainHeight(seen)) {
        process.stdout.write(
          `\n  ⚠ After ${Math.round(stalledFor / 1000)}s no wallet has learned the chain height ` +
            `(all showing 0/0).\n` +
            `    This is not a slow sync — it is not starting. Waiting longer will not help.\n` +
            `    The usual cause is a ledger protocol mismatch: the network emits a\n` +
            `    version this install cannot deserialize, so no event is ever applied.\n` +
            `    Check it with:  npm run check-protocol\n` +
            `    See DEPLOY.md.\n`,
        );
      } else {
        process.stdout.write(
          `\n  ⚠ No progress for ${Math.round(stalledFor / 1000)}s. ` +
            `Run \`npm run check-endpoints\` in another terminal — see DEPLOY.md.\n`,
        );
      }
    }
  };

  const render = () => {
    try {
      renderOnce();
    } catch (err) {
      // Reporting is cosmetic; it must never take the sync down with it.
      renderFailures += 1;
      if (renderFailures === 1) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(`\n  (progress display unavailable: ${msg})\n`);
      }
      if (renderFailures >= 3) clearInterval(timer);
    }
  };

  const timer = setInterval(render, intervalMs);
  render();

  return {
    stop() {
      clearInterval(timer);
      try {
        sub?.unsubscribe();
      } catch {
        // already torn down
      }
      process.stdout.write('\r' + ' '.repeat(78) + '\r');
    },
    summary() {
      const parts = KINDS.filter((k) => latest[k]).map((k) => {
        const p = latest[k]!;
        return `${k} ${toNum(p.appliedId)}/${toNum(p.highestTransactionId)}`;
      });
      return parts.length > 0 ? parts.join(', ') : 'no progress reported';
    },
  };
};
