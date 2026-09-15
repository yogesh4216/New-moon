# Deploy checklist

Two deploys: the **contract** to Midnight Preprod, then the **frontend** to Vercel.

Everything below runs on your own machine. It cannot run from a Claude Code web
session — the Preprod endpoints are firewalled there and there is no Docker
daemon for the proof server.

---

## 0. Get the code

```bash
git clone https://github.com/yogesh4216/New-moon.git
cd New-moon
git checkout claude/wonderful-feynman-9oczen
npm install
```

Check your Node version — Midnight needs 22:

```bash
node -v        # must print v22.x
```

If it does not: `nvm install 22 && nvm use 22`

Start Docker Desktop and confirm it is up:

```bash
docker info >/dev/null && echo "docker ok"
```

---

## 1. Deploy the contract to Preprod

### The scripted way

```bash
bash scripts/deploy-preprod.sh
```

It runs the preflight checks, retires the leaked wallet seed, starts the proof
server, shows you the address to fund, waits while you use the faucet, deploys,
and writes the resulting address into `.env`.

### The manual way

```bash
# 1. The seeds in .midnight-state.json were committed to a public repo.
#    Delete the file so a fresh wallet is generated.
rm -f .midnight-state.json

# 2. Select the network
npm run network preprod

# 3. Start the proof server (Docker)
npm run proof-server:start

# 4. Print your new wallet address (instant — no chain sync)
npm run address

# 5. Fund it: https://midnight-tmnight-preprod.nethermind.dev

# 6. Deploy — syncs the wallet, then prints the Preprod contract address
npm run deploy -- --network preprod
```

Copy the printed address. That is your **Preprod contract address**.

---

## 2. Point the frontend at it

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_NETWORK_ID=preprod
VITE_CONTRACT_ADDRESS=<the address from step 1>
```

Verify locally before deploying — Lace must be unlocked and set to Preprod:

```bash
npm run dev
```

Connect the wallet, call the circuit, confirm a real transaction hash comes
back and the public counter moves.

---

## 3. Deploy the frontend

```bash
npm i -g vercel
vercel login
vercel link

vercel env add VITE_CONTRACT_ADDRESS production   # paste the Preprod address
vercel env add VITE_NETWORK_ID production         # type: preprod

vercel --prod
```

Vercel prints the live URL.

<details>
<summary>Netlify instead</summary>

```bash
npm i -g netlify-cli
netlify login
netlify init
netlify env:set VITE_CONTRACT_ADDRESS <the address from step 1>
netlify env:set VITE_NETWORK_ID preprod
netlify deploy --prod
```
</details>

---

## 4. Update the README

Fill in the two placeholders in `README.md`:

- **Contract Address** table → your Preprod address
- **Live Demo** → the URL Vercel printed
- **Demo Video** → your recording link

```bash
git add README.md .env.example
git commit -m "Add Preprod contract address and live demo URL"
git push
```

---

## Troubleshooting

**Sync runs for many minutes / `Wallet.Sync: [object Object]`**
A fresh wallet on a public network replays a lot of history, so the first sync
is genuinely slow — but it should be *moving*. Both `check-balance` and `deploy`
now print live per-wallet progress:

```
⏳ syncing 240s — s:82.1% u:99.4% d:11.7%
```

`s`/`u`/`d` are the shielded, unshielded and dust wallets. If those percentages
climb, it is working; leave it. If nothing moves for two minutes you get an
explicit stall warning, and `[disconnected]` appears when the indexer link drops.

You do **not** need a completed sync to find your funding address — `npm run
address` derives it from the seed with no network access at all.

If it is genuinely stuck, check the endpoints first:

```bash
npm run check-endpoints preprod
```

Sync needs three things reachable — the indexer over HTTPS, the indexer over
WebSocket, and the RPC node over WebSocket. An HTTPS-only check is not enough:
a proxy or VPN that allows HTTPS but blocks WebSocket upgrades produces exactly
the repeating `disconnected ... 1000:: Normal Closure` loop, because the socket
opens and is closed before sync can make progress.

If the WebSocket rows fail while HTTPS passes, that is your cause — try a
different network, or disable the VPN/proxy for this host.

**`SharedArrayBuffer is not defined` / proving hangs in the browser**
The page is not cross-origin isolated. `vercel.json` and `netlify.toml` already
set COOP/COEP; on a custom host you must send both headers yourself.

**Proof generation hangs on an Apple Silicon Mac**
Make sure the proof server is `8.1.0`, not `7.x` — the 7.x line spins forever on
Apple Silicon. It is pinned correctly in `docker-compose.yml`; do not downgrade.

**`Wallet is on "X" but this dApp targets "preprod"`**
Lace → Settings → Network → Preprod, then reconnect.

**`No Midnight wallet detected`**
Install Lace, then hard-reload the page. Extensions inject after page load, so
the app rechecks for 5 seconds before giving up.

**`npm run compile` fails**
It needs the `compact` CLI, which is separate from npm. You do not need it
unless you change `contracts/counter.compact` — the compiled output in
`managed/` is committed.

**`ERR_MODULE_NOT_FOUND: Cannot find package '@midnight-ntwrk/...'`**
Your `node_modules` predates a dependency change. Re-sync:

```bash
npm install
```

If it persists, clear and reinstall: `rm -rf node_modules package-lock.json && npm install`

**`WARN[0000] No services to build`**
Harmless. `docker compose` prints it when no service has a `build:` section —
the proof server runs from a prebuilt image. The script now waits for port 6300
and fails loudly if it never opens.

**Node 25 (or any non-22 version)**
`package.json` allows Node >= 22, but the Midnight SDK and its wasm deps are
tested against Node 22 LTS. Node 23/25 are non-LTS lines.

The clearest symptom is a sync that reports `s:0/0 u:0/0 d:0/0` indefinitely —
all endpoints reachable, the RPC socket opening and closing with `1000 Normal
Closure`, and the chain height never learned. Fix:

```bash
nvm install 22 && nvm use 22
rm -rf node_modules package-lock.json && npm install
node -v          # confirm v22.x before retrying
```

**Sync stuck at `0/0` — find out why**

```bash
npm run diagnose-indexer preprod
```

`check-endpoints` only proves a socket opens. This asks the indexer for the
chain height over HTTPS and opens a real `graphql-transport-ws` subscription,
because `highestTransactionId` — the value whose staying at 0 means sync never
starts — comes from the **indexer**, not the RPC node. The repeating
`subscribeRuntimeVersion ... Normal Closure` lines are the RPC node and are a
red herring for this failure.

It distinguishes the two causes that actually matter:

- **GraphQL errors / subscription rejected** → API-version or schema mismatch
  between the SDK and what the network currently serves. Not fixable by
  changing Node.
- **Both transports serve data fine** → the indexer is healthy, so suspect the
  Node version or the SDK/network version pairing.

**Installing Node 22 without nvm**

`nvm` is not installed by default on macOS. Either install it, or use Homebrew:

```bash
brew install node@22
brew link --overwrite --force node@22
node -v      # v22.x
```

Or with nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
exec $SHELL -l
nvm install 22 && nvm use 22
```

After switching: `rm -rf node_modules package-lock.json && npm install`

**Telling "slow sync" apart from "not syncing"**
Read the progress line:

- `s:12.4% u:99.1% d:3.0%` — working. Percentages mean the chain height is
  known and transactions are being applied. Leave it.
- `s:0/0 u:0/0 d:0/0` — **not** working. The wallet never learned the chain
  height, so there is nothing to make progress against. Waiting will not help;
  this never becomes a percentage on its own.

**Deploy fails with a balance error**
The faucet has not landed yet. Re-run `npm run check-balance` and wait.
