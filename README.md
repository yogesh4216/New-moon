# Midnight Counter dApp

> Increment a public on-chain counter without revealing by how much — zero-knowledge proofs generated locally in the browser.

## Live Demo

<!-- Replace after running `vercel --prod` (see "Deploy the frontend" below). -->
`[PASTE LIVE URL AFTER DEPLOYING FRONTEND]`

Previous Level 1 preview deployment: https://my-project-two-kappa-70.vercel.app
(That build is superseded — it pointed at a preview-network contract and simulated the circuit call.)

## Contract Address

| Network | Address |
|---------|---------|
| Preprod | `[PASTE PREPROD ADDRESS AFTER RUNNING npm run deploy]` |

> **Not yet deployed to Preprod.** The Level 1 address
> `9c5d4d5021efa9f668825dfd13833ba62d5936597407aa46e1bf670fb68e3b63` is a
> **preview**-network deployment, recorded under `deployments.preview` in the
> local state file. Run the deploy steps below to obtain a Preprod address and
> fill in this table.

## What This Does

A minimal privacy-preserving counter, built as the logic layer for a
decentralized voting or ticketing system.

A shared counter lives on-chain as public ledger state. Any connected user can
increase it by an amount of their choosing. The amount is supplied as an input
to the `increment` circuit and is used to build a zero-knowledge proof on the
user's own device. What reaches the network is the proof plus the resulting
state transition — not the user's keystrokes, and not a plaintext copy of their
chosen amount sent to any server operated by this project.

The frontend does three things: connects to the Lace wallet, calls the
`increment` circuit on a deployed contract, and reads the resulting public
counter value back from the indexer.

## Privacy Model

- **What is PUBLIC**
  - The `count` value in the contract's ledger state.
  - The contract address and the fact that a call to `increment` occurred.
  - The transaction, its fees, and the wallet's public transaction graph.
  - The zero-knowledge proof itself.

- **What is PRIVATE**
  - The value typed into the increment field never leaves the device as
    plaintext addressed to this project. It is consumed by local proof
    generation inside the Lace extension.
  - Any private state the contract might hold is stored in browser-local
    LevelDB/IndexedDB and encrypted at rest.

- **What the user PROVES without revealing**
  - That they executed a valid `increment` state transition, and that the new
    public `count` follows correctly from the previous one.

### An honest caveat about this particular contract

`contracts/counter.compact` calls `disclose(increment_amount)`:

```compact
export circuit increment(increment_amount: Uint<32>): [] {
    count = (count + disclose(increment_amount)) as Uint<32>;
}
```

`disclose()` deliberately releases the value so it can be added to public
ledger state. **This means the increment amount is recoverable from the public
counter's delta** — an observer who watches `count` before and after a
transaction learns exactly what was added.

So the privacy boundary demonstrated here is *the transport and proving path*,
not *the amount itself*. The input is never rendered in the UI, never logged,
and never POSTed to a server we run; proving happens on the user's device. A
contract that kept the amount genuinely secret would accumulate it into a
commitment or a Merkle-tree-backed private ledger instead of a public `Uint`.
That is the natural Level 3 extension of this project.

## Privacy Claim

**An on-chain observer of this dApp can see:** the contract address, that an
`increment` call happened, the transaction hash, the fees paid, the wallet
addresses funding the transaction, the zero-knowledge proof, and the public
`count` before and after.

**An on-chain observer cannot see:** the contents of the user's browser session,
the private state stored locally on the user's device, or any intermediate
value produced while the proof was being constructed. No server operated by
this project ever receives the user's input — proving is delegated to the Lace
wallet running on the user's own machine via `getProvingProvider`.

**Because this contract calls `disclose()`, the increment amount itself is
*not* hidden** — it is derivable from the change in the public counter. See the
caveat above.

## Tech Stack

Midnight Network · Compact `0.23` · Midnight.js SDK `4.1.1` ·
`@midnight-ntwrk/dapp-connector-api` `4.0.1` · React 19 · Vite 8 · Lace wallet

## Prerequisites

- **Lace wallet** browser extension, set to the **Preprod** network
- **Node.js v22** (`node -v` → `v22.x`)
- **Docker** — only needed for deploying/compiling, not for running the frontend

## Run Locally

```bash
# 1. Clone
git clone https://github.com/yogesh4216/new-moon.git
cd new-moon

# 2. Install
npm install

# 3. Point the app at your Preprod contract
cp .env.example .env
#    then edit .env and set:
#      VITE_NETWORK_ID=preprod
#      VITE_CONTRACT_ADDRESS=<your preprod contract address>

# 4. Run
npm run dev
```

Open the printed `localhost` URL with the Lace extension unlocked and set to
Preprod, then click **Connect Wallet**.

`npm run dev` copies the compiled ZK artifacts from `managed/` into
`public/managed/` so the browser can fetch the prover and verifier keys.

### Other commands

| Command | Does |
|---------|------|
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run typecheck` | Typecheck the browser app only |
| `npm test` | Contract and privacy regression tests |
| `npm run compile` | Recompile `contracts/counter.compact` → `managed/` |
| `npm run proof-server:start` | Start the local proof server (Docker) |

## Deploy to Preprod

See **[DEPLOY.md](./DEPLOY.md)** for the full checklist, or run:

```bash
bash scripts/deploy-preprod.sh
```

The contract must be deployed from a machine with Docker and network access to
the Preprod endpoints.

```bash
# 1. Start the proof server
npm run proof-server:start

# 2. Create/fund a Preprod wallet and check the balance
npm run setup
npm run check-balance
#    Fund the printed address from the Preprod faucet:
#    https://midnight-tmnight-preprod.nethermind.dev

# 3. Deploy — prints the Preprod contract address
npm run deploy

# 4. Put that address in .env and in the table at the top of this README
```

## Deploy the frontend

**Vercel**

```bash
npm i -g vercel
vercel login
vercel link
vercel env add VITE_CONTRACT_ADDRESS production   # paste your Preprod address
vercel env add VITE_NETWORK_ID production         # preprod
vercel --prod
```

**Netlify**

```bash
npm i -g netlify-cli
netlify login
netlify init
netlify env:set VITE_CONTRACT_ADDRESS <your-preprod-address>
netlify env:set VITE_NETWORK_ID preprod
netlify deploy --prod
```

Both configs set `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy`, which Midnight's proving WASM needs in order to
use `SharedArrayBuffer`. Without those headers proof generation fails in the
browser.

## Project Structure

```
.
├── contracts/counter.compact     Compact source
├── managed/                      Compiled contract, prover/verifier keys, ZKIR
├── src/
│   ├── components/
│   │   ├── WalletConnect.tsx     Connect/disconnect UI + error states
│   │   └── CircuitCall.tsx       Circuit call button, loading, tx result
│   ├── hooks/useMidnight.ts      Wallet lifecycle + Midnight.js providers
│   ├── lib/
│   │   ├── wallet.ts             Wallet discovery, connect, error mapping
│   │   ├── providers.ts          Midnight.js provider wiring
│   │   └── counterContract.ts    findDeployedContract + increment call
│   ├── config.ts                 Env-driven network/contract configuration
│   ├── App.tsx
│   └── main.tsx                  (plus Level 1 CLI tooling: deploy, setup, cli)
├── tests/                        Contract + privacy regression tests
├── public/                       Static assets (ZK artifacts copied in at build)
├── .github/workflows/ci.yml      Typecheck, test, build
├── vercel.json / netlify.toml
├── package.json
└── vite.config.ts
```

## Security Note

`.midnight-state.json` and `.midnight-wallet-state/` hold **wallet seeds** and
are now gitignored. Earlier commits on this repository contain two seeds in
plaintext, so **those wallets must be treated as compromised** — do not fund
them again. Generate a fresh wallet with `npm run setup` before deploying.

## Demo Video

`[PLACEHOLDER — add link after recording]`
