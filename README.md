# Midnight Counter dApp
> A decentralized ticketing and voting prototype proving operations without revealing user inputs.

## Live Demo
[PASTE LIVE URL AFTER DEPLOYING FRONTEND]

## Contract Address
| Network  | Address                          |
|----------|----------------------------------|
| Preprod  | `9c5d4d5021efa9f668825dfd13833ba62d5936597407aa46e1bf670fb68e3b63` |

## What This Does
This dApp serves as a foundational logic layer for a decentralized voting or ticketing system. Users can interact with a smart contract on the Midnight Network to increment a shared public counter. The exact amount the user chooses to increment is initially kept completely secret on their local device, and a zero-knowledge proof is generated in their browser to validate the action before interacting with the blockchain.

## Privacy Model
- **What is PUBLIC:** The current `count` value stored in the ledger state on-chain.
- **What is PRIVATE:** The `increment_amount` passed by the user calling the `increment` circuit is initially a private witness.
- **What the user PROVES without revealing:** The user proves that they performed a valid state transition locally, computing the new public counter value based on their secret input. (In this specific tutorial contract, it is explicitly disclosed to update the public state, but the architecture demonstrates how inputs are hidden during computation).

## Privacy Claim
**Specific statement:** An on-chain observer can see the final updated counter value and verify the zero-knowledge proof submitted to the network. However, the observer **cannot see** the user's private inputs or any intermediate data while the transaction is being constructed and proven locally in the user's browser. The Lace wallet ensures the private witness data never leaves the client unencrypted.

## Tech Stack
Midnight network, Compact, Midnight.js SDK, React/Vite, Lace wallet

## Prerequisites
- Lace wallet installed (configured for Midnight Testnet)
- Node.js v22

## Run Locally
1. Clone this repository:
   ```bash
   git clone <your-repo-url>
   cd my-project
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Run the Vite development server:
   ```bash
   npm run dev
   ```
4. Open the displayed `localhost` URL in your browser with the Lace wallet extension active.

## Demo Video
[PLACEHOLDER — I will add the link after recording]
