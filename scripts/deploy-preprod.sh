#!/usr/bin/env bash
# Deploys contracts/counter.compact to the Midnight Preprod network and wires
# the resulting address into .env for the frontend.
#
#   bash scripts/deploy-preprod.sh
#
# Requires: Node 22, Docker running, and outbound access to *.preprod.midnight.network.
set -euo pipefail

cd "$(dirname "$0")/.."

say()  { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
say "Checking prerequisites"

node -e 'process.exit(parseInt(process.versions.node) >= 22 ? 0 : 1)' \
  || die "Node 22+ required (found $(node -v)). Try: nvm use 22"
echo "  node $(node -v)"

docker info >/dev/null 2>&1 \
  || die "Docker is not running. Start Docker Desktop and re-run."
echo "  docker ok"

curl -sS --max-time 15 -o /dev/null \
  https://indexer.preprod.midnight.network/api/v4/graphql \
  || die "Cannot reach indexer.preprod.midnight.network — check your network."
echo "  preprod reachable"

[ -d node_modules ] || { say "Installing dependencies"; npm install; }

# ------------------------------------------------- retire compromised seeds
# The seeds previously committed to this repository are public. If the old
# state file is still on disk, deploy would silently reuse that wallet.
if [ -f .midnight-state.json ] && grep -q 'ef16dc4d9b66de04e026cc026c03361f7bd431207fea272ebc74646222d708db' .midnight-state.json; then
  warn "Found the leaked preprod seed in .midnight-state.json."
  echo "  That wallet is public — anything you fund there can be taken."
  read -r -p "  Delete it and generate a fresh wallet? [Y/n] " reply
  case "${reply:-Y}" in
    [Nn]*) die "Refusing to deploy with a compromised seed." ;;
    *) mv .midnight-state.json ".midnight-state.json.compromised.$(date +%s)"
       echo "  Moved aside. A fresh wallet will be generated." ;;
  esac
fi

# ------------------------------------------------------------------- deploy
say "Selecting the preprod network"
npm run --silent network preprod

say "Starting the proof server (docker)"
npm run --silent proof-server:start

say "Your preprod wallet"
npm run --silent check-balance

cat <<'EOF'

  ─────────────────────────────────────────────────────────────
  Fund the address printed above from the Preprod faucet:
      https://midnight-tmnight-preprod.nethermind.dev
  Wait for the balance to appear, then continue.
  ─────────────────────────────────────────────────────────────
EOF
read -r -p "  Press Enter once the wallet is funded… "

say "Deploying to preprod (this generates proofs — it takes a few minutes)"
npm run deploy -- --network preprod

# ----------------------------------------------------------------- wire up
ADDRESS=$(node -e "
  try {
    const s = require('./.midnight-state.json');
    process.stdout.write(s.deployments?.preprod?.address ?? '');
  } catch { process.stdout.write(''); }
")

[ -n "$ADDRESS" ] || die "Deploy finished but no preprod address was recorded. Check the output above."

say "Deployed to preprod"
echo "  $ADDRESS"

touch .env
if grep -q '^VITE_CONTRACT_ADDRESS=' .env 2>/dev/null; then
  # macOS and GNU sed disagree about -i, so rewrite the file instead.
  node -e "
    const fs = require('fs');
    const out = fs.readFileSync('.env','utf8')
      .replace(/^VITE_CONTRACT_ADDRESS=.*\$/m, 'VITE_CONTRACT_ADDRESS=$ADDRESS');
    fs.writeFileSync('.env', out);
  "
else
  printf 'VITE_NETWORK_ID=preprod\nVITE_CONTRACT_ADDRESS=%s\n' "$ADDRESS" >> .env
fi
echo "  Written to .env"

cat <<EOF

  Next:
    1. Paste this into the Contract Address table in README.md:
         | Preprod | \`$ADDRESS\` |
    2. npm run dev        # verify locally against Preprod
    3. vercel --prod      # deploy the frontend

EOF
