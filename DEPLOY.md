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

# 4. Print your new wallet address
npm run check-balance

# 5. Fund it: https://midnight-tmnight-preprod.nethermind.dev
#    Re-run check-balance until the balance is non-zero.
npm run check-balance

# 6. Deploy — prints the Preprod contract address
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

**Deploy fails with a balance error**
The faucet has not landed yet. Re-run `npm run check-balance` and wait.
