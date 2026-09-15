import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { Contract, ledger } from '../../managed/contract/index.js';
import { CONTRACT_ADDRESS } from '../config';

/**
 * The provider bundle from `buildProviders`. Midnight.js types this through a
 * chain of Effect-based generics tied to the compiled contract; pinning that
 * down here buys no safety for a two-circuit contract, so it stays loose.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Providers = any;

/** Result of a successful `increment` call, as reported by the network. */
export interface IncrementResult {
  txId: string;
  txHash: string;
  blockHeight: number | null;
  /** Public counter value read back from the ledger after the call. */
  countAfter: bigint | null;
}

/**
 * The counter contract declares no witnesses, so it carries no private state —
 * `withVacantWitnesses` says exactly that.
 */
const compiledContract = CompiledContract.withVacantWitnesses(
  CompiledContract.make('counter', Contract as never),
);

/**
 * Calls the `increment` circuit on the deployed contract.
 *
 * `amount` is the circuit's private input. It feeds local proof generation and
 * is never transmitted as plaintext — only the resulting proof and the updated
 * public state reach the network.
 */
export const callIncrement = async (
  providers: Providers,
  amount: bigint,
): Promise<IncrementResult> => {
  const found = await findDeployedContract(providers, {
    compiledContract,
    contractAddress: CONTRACT_ADDRESS,
  } as never);

  const finalized = (await (found.callTx as Record<string, (a: bigint) => Promise<unknown>>)
    .increment(amount)) as {
    public?: { txId?: string; txHash?: string; blockHeight?: number };
    txId?: string;
    txHash?: string;
    blockHeight?: number;
  };

  const tx = finalized.public ?? finalized;

  return {
    txId: tx.txId ?? '',
    txHash: tx.txHash ?? '',
    blockHeight: tx.blockHeight ?? null,
    countAfter: await readCount(providers).catch(() => null),
  };
};

/** Reads the public `count` value from the contract's on-chain ledger state. */
export const readCount = async (providers: Providers): Promise<bigint | null> => {
  const state = await providers.publicDataProvider.queryContractState(CONTRACT_ADDRESS);
  if (!state) return null;
  return ledger(state.data as never).count;
};
