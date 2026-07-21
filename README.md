# Midnight Counter Contract
> A simple smart contract on the Midnight Network that privately increments a public counter.

## Contract Address
| Network  | Address                          |
|----------|----------------------------------|
| Preview  | [PASTE ADDRESS AFTER DEPLOY]     |
| Preprod  | [PASTE ADDRESS AFTER DEPLOY]     |

## What This Does
This contract maintains a public counter on the Midnight blockchain. Users can increment this counter by a specific amount. The exact amount is initially passed as a private witness (meaning it starts off hidden), but the contract logic deliberately discloses it to add it to the public total. This serves as a basic demonstration of Midnight's data privacy mechanisms, specifically how to mix public and private state using the `disclose()` function.

## Privacy Model
- **What is PUBLIC (on-chain, visible to anyone):** The current `count` value stored in the ledger state.
- **What is PRIVATE (private witness, never on-chain):** The `increment_amount` passed by the user calling the `increment` circuit is initially a private witness.
- **What the user PROVES without revealing:** The user proves that the new public counter value is exactly equal to the old counter value plus the increment amount they provided (which is disclosed during execution). In a more complex contract, the user could prove the amount satisfies certain conditions (e.g., > 0) without fully revealing it, but here we explicitly disclose it to update the public counter.

## Tech Stack
- Midnight network, Compact language, Node.js v22, Docker

## Prerequisites
- **Node.js** (v22 or later)
- **Docker** (running, to host the local proof server)
- **Midnight Compact Compiler** (installed via official bash installer script)
- **Midnight wallet extensions / CLI** for managing funds on Preview/Preprod networks

## Setup
1. Clone this repository and navigate to the project directory:
   ```bash
   cd my-project
   ```
2. Start the local Midnight proof server in Docker:
   ```bash
   docker run -d -p 6300:6300 midnightnetwork/proof-server
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Compile the Compact contract:
   ```bash
   compact compile contracts/counter.compact managed/
   ```

## Run Tests
To run the automated test suite and verify the contract logic and state transitions, use the following command:
```bash
npm run test
```

## Initial Idea
[LEAVE PLACEHOLDER — I will fill this in manually]

## Screenshots
[LEAVE PLACEHOLDER — I will add compile output and contract address screenshots]
