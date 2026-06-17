#!/usr/bin/env bash
# Deploy the Pharos Agent Identity Skill contracts to Pharos Atlantic testnet (default) or mainnet.
# Reads PRIVATE_KEY from the environment. Writes the deployed addresses to
# assets/deployment.json.
#
# Usage:
#   PRIVATE_KEY=0x... ./scripts/deploy.sh atlantic
#   PRIVATE_KEY=0x... ./scripts/deploy.sh mainnet
#
# Pre-checks: PRIVATE_KEY is set, RPC reachable, deployer has a non-zero balance.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

NETWORK="${1:-atlantic}"

case "$NETWORK" in
  atlantic|atlantic-testnet)
    RPC="https://atlantic.dplabs-internal.com"
    CHAIN_ID=688689
    EXPLORER="https://atlantic.pharosscan.xyz"
    NETWORK_KEY="atlantic-testnet"
    ;;
  mainnet)
    RPC="https://rpc.pharos.xyz"
    CHAIN_ID=1672
    EXPLORER="https://www.pharosscan.xyz"
    NETWORK_KEY="mainnet"
    ;;
  local|local-anvil)
    RPC="${LOCAL_RPC:-http://127.0.0.1:8545}"
    CHAIN_ID=31337
    EXPLORER="http://localhost"
    NETWORK_KEY="local-anvil"
    ;;
  *)
    echo "Unknown network: $NETWORK (use 'atlantic', 'mainnet', or 'local')" >&2
    exit 1
    ;;
esac

# Pre-checks
if [[ -z "${PRIVATE_KEY:-}" ]]; then
  if [[ -n "${PHAROS_DEPLOYER_KEY:-}" ]]; then
    export PRIVATE_KEY="$PHAROS_DEPLOYER_KEY"
    echo "Using PHAROS_DEPLOYER_KEY (from .env.d/deployer.env)"
  elif [[ -n "${DEPLOYER_KEY:-}" ]]; then
    export PRIVATE_KEY="$DEPLOYER_KEY"
  fi
fi
if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "ERROR: PRIVATE_KEY is not set. Set it in your shell: export PRIVATE_KEY=0x..." >&2
  echo "       Or copy .env.d/deployer.example.env to .env.d/deployer.env and source it." >&2
  exit 1
fi

if ! command -v forge >/dev/null 2>&1; then
  echo "ERROR: forge not found. Install Foundry: curl -L https://foundry.paradigm.xyz | bash && source ~/.zshenv && foundryup" >&2
  exit 1
fi

# Derive the deployer address
DEPLOYER=$(forge wallet address --private-key "$PRIVATE_KEY" 2>/dev/null || cast wallet address --private-key "$PRIVATE_KEY")
echo "Deployer: $DEPLOYER"
echo "Network:  $NETWORK_KEY (chainId $CHAIN_ID)"
echo "RPC:      $RPC"
echo

# Check deployer balance
BALANCE_HEX=$(cast balance "$DEPLOYER" --rpc-url "$RPC" --ether 2>/dev/null || echo "0")
echo "Balance:  $BALANCE_HEX native"

if [[ "$BALANCE_HEX" == "0" || "$BALANCE_HEX" == "0.000000000" ]]; then
  echo "WARNING: deployer has zero balance on $NETWORK_KEY." >&2
  echo "Get testnet PHRS from the Pharos Atlantic faucet or ask in the Pharos developer Telegram/Discord." >&2
  read -r -p "Continue anyway? (yes/no) " REPLY
  if [[ "$REPLY" != "yes" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Confirm mainnet
if [[ "$NETWORK" == "mainnet" ]]; then
  echo "⚠️  You are about to deploy to PHAROS MAINNET." >&2
  read -r -p "Continue? (yes/no) " REPLY
  if [[ "$REPLY" != "yes" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

cd "$ROOT_DIR"

# Deploy via Forge
echo "Deploying..."
GAS_PRICE_FLAG=()
if [[ -n "${PHAROS_GAS_PRICE:-}" ]]; then
  GAS_PRICE_FLAG=(--gas-price "$PHAROS_GAS_PRICE")
  echo "Using custom gas price: $PHAROS_GAS_PRICE"
fi
DEPLOYMENT_OUT="$ROOT_DIR/.deployment-latest.json" \
  forge script script/Deploy.s.sol:DeployIdentitySkill \
  --rpc-url "$RPC" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  "${GAS_PRICE_FLAG[@]}"

if [[ ! -f "$ROOT_DIR/.deployment-latest.json" ]]; then
  echo "ERROR: forge did not write a deployment record. Did the broadcast succeed?" >&2
  exit 1
fi

# Merge the per-network deployment into assets/networks.json under the right network key.
NETWORK_KEY_FROM_DEPLOY=$(jq -r '.network' "$ROOT_DIR/.deployment-latest.json")
PHAROS_AGENT_ID_ADDR=$(jq -r '.pharosAgentId' "$ROOT_DIR/.deployment-latest.json")
CREG_ADDR=$(jq -r '.credentialRegistry' "$ROOT_DIR/.deployment-latest.json")

if [[ -z "$NETWORK_KEY_FROM_DEPLOY" || "$PHAROS_AGENT_ID_ADDR" == "null" ]]; then
  echo "ERROR: deployment record is malformed:" >&2
  cat "$ROOT_DIR/.deployment-latest.json" >&2
  exit 1
fi

# Use jq to merge the new deployment entry into the existing deployment map,
# preserving any other networks already recorded (e.g. mainnet + local-anvil).
TMP=$(mktemp)
jq --slurpfile new "$ROOT_DIR/.deployment-latest.json" \
   '.deployment[$new[0].network] = $new[0]' \
   "$ROOT_DIR/assets/networks.json" > "$TMP"
mv "$TMP" "$ROOT_DIR/assets/networks.json"
rm -f "$ROOT_DIR/.deployment-latest.json"

echo
echo "✓ Deployed to $NETWORK_KEY_FROM_DEPLOY (chainId $CHAIN_ID)"
echo "  PharosAgentID:        $PHAROS_AGENT_ID_ADDR"
echo "  CredentialRegistry:   $CREG_ADDR"
echo "  Explorer:             $EXPLORER"
echo
echo "Next: bash scripts/verify.sh $NETWORK  (to verify source on Pharos Scan)"
echo "      bash scripts/demo.sh          (to walk the end-to-end demo)"
