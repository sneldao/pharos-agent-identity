#!/usr/bin/env bash
# scripts/forge.sh — find and run Foundry's forge binary.
#
# A separate CLI tool called `forge` (e.g. at ~/.local/bin/forge) can shadow
# Foundry's forge in the PATH. This wrapper finds the real Foundry forge by
# checking ~/.foundry/bin/forge first, then falling back to `forge` in PATH
# only if it reports a Foundry version string.
#
# Usage: bash scripts/forge.sh <forge args...>
#   bash scripts/forge.sh test -vvv
#   bash scripts/forge.sh build
#   bash scripts/forge.sh script script/Deploy.s.sol --broadcast

set -euo pipefail

if [[ -x "$HOME/.foundry/bin/forge" ]]; then
  exec "$HOME/.foundry/bin/forge" "$@"
elif command -v forge >/dev/null 2>&1 && forge --version 2>&1 | grep -q "forge Version"; then
  exec forge "$@"
else
  echo "ERROR: Foundry's forge not found." >&2
  echo "Install: curl -L https://foundry.paradigm.xyz | bash && source ~/.zshenv && foundryup" >&2
  exit 1
fi
