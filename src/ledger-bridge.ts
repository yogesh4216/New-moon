/**
 * Adapter between the wallet SDK 2.x and Midnight.js 5.x transaction seams.
 *
 * The two speak different currencies now:
 *
 *  - Midnight.js hands a provider a raw ledger object (`UnboundTransaction`)
 *    and expects one back.
 *  - The wallet facade takes a `WalletTransaction` *handle*, which seals the
 *    raw transaction together with the protocol version that built it. A handle
 *    stamped for one side of the v8/v9 boundary is refused by a wallet acting
 *    on the other side, which is the point of the wrapper.
 *
 * So the bridge stamps on the way in and unseals on the way out, using the
 * protocol version the facade reports for the synced chain rather than a
 * literal, so a fork moves this with it.
 */
import { Either } from 'effect';
import { ProtocolVersion, WalletTransaction } from '@midnight-ntwrk/wallet-sdk';

/** Handles carry a protocol version; a reader states the range it accepts. */
const rangeFor = (version: ProtocolVersion.ProtocolVersion): ProtocolVersion.ProtocolVersion.Range =>
  ProtocolVersion.makeRange(version, ProtocolVersion.MaxSupportedVersion);

/** Seals a raw ledger transaction into a handle the facade will accept. */
export const seal = <S extends 'Unbound' | 'Unproven' | 'Finalized'>(
  stage: S,
  tx: unknown,
  version: ProtocolVersion.ProtocolVersion,
): WalletTransaction<S> =>
  WalletTransaction.adopt(stage, tx as never, version) as WalletTransaction<S>;

/**
 * Reads the raw ledger transaction back out of a handle.
 *
 * Throws rather than returning an Either: this sits inside a Midnight.js
 * provider callback, whose contract is a promise of a transaction, and a
 * version mismatch here is a wiring error rather than an ordinary state.
 */
export const unseal = <T>(
  handle: unknown,
  version: ProtocolVersion.ProtocolVersion,
): T => {
  const result = WalletTransaction.unwrapWithin<T>(
    handle as WalletTransaction,
    rangeFor(version),
  );
  if (Either.isLeft(result)) {
    throw new Error(
      `Transaction was built for a protocol version this wallet cannot act at: ${String(result.left)}`,
    );
  }
  return result.right;
};
