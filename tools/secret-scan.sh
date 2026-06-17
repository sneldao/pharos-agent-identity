#!/usr/bin/env bash
# tools/secret-scan.sh — scan staged changes for likely secrets.
#
# Exits 0 if clean, 1 if any high-confidence match is found, 2 if the user
# skips with --no-verify. The pre-commit hook calls this. You can also run
# it standalone: `bash tools/secret-scan.sh` (scans working tree) or
# `bash tools/secret-scan.sh --staged` (scans staged only).
#
# This is intentionally written in pure bash + grep — no external deps
# beyond coreutils. For a more thorough scan, install `gitleaks` and it
# will be picked up automatically if available (see hook).

set -uo pipefail

# ---------- config ----------
BASELINE_FILE="${BASELINE_FILE:-.secrets.baseline}"

# Patterns. Each entry is `name|regex`. The regex is passed to `grep -E`.
# Use lookaheads / lookbehinds sparingly; we lean on the --word-regexp and
# context flags in the loop below.
#
# To suppress a known false-positive, add the line:file:match:hash to the
# baseline file. `tools/secret-scan.sh --update-baseline` regenerates it.
PATTERNS=(
  'eth-private-key|0x[0-9a-fA-F]{64}'
  'eth-addresses-are-fine|0x[0-9a-fA-F]{40}'
  'github-pat|gh[pousr]_[A-Za-z0-9]{36,255}'
  'github-fine-grained|github_pat_[A-Za-z0-9_]{82}'
  'openai-key|sk-(proj-)?[A-Za-z0-9]{20,}'
  'anthropic-key|sk-ant-[A-Za-z0-9-]{20,}'
  'google-api-key|AIza[0-9A-Za-z_-]{35}'
  'aws-access-key|AKIA[0-9A-Z]{16}'
  'aws-secret-key|aws_secret_access_key[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9/+=]{40}["'"'"']?'
  'slack-token|xox[baprs]-[A-Za-z0-9-]{10,}'
  'jwt|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
  'pem-private-key|-----BEGIN[[:space:]]+[A-Z]+[[:space:]]+PRIVATE[[:space:]]+KEY-----'
  'discord-webhook|https://(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+'
  'alchemy-key|alchemy[a-zA-Z0-9_-]{20,}'
  'infura-key|infura[a-zA-Z0-9_-]{20,}'
)

# Generic env-style: NAME=value where value is high-entropy
# (excluded names are common false positives: address constants, public rpcs)
GENERIC_REGEX='(PRIVATE_KEY|SECRET_KEY|API_KEY|API_TOKEN|AUTH_TOKEN|ACCESS_TOKEN|MNEMONIC|SEED_PHRASE|PASSWORD|PASSWD|PWD)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9+/=_-]{16,}["'"'"']?'
EXCLUDE_FROM_GENERIC_REGEX='(PRIVATE_KEY=\$\{|process\.env\.PRIVATE_KEY|PASSWORD.*placeholder|0x\.\.\.|<.*>|YOUR_.*_KEY)'

# Files to always skip
SKIP_GLOBS=(
  '*.md'
  '*.markdown'
  'LICENSE*'
  '*.png'
  '*.jpg'
  '*.jpeg'
  '*.gif'
  '*.pdf'
  'tools/secret-scan.sh'
  '.githooks/*'
  '.secrets.baseline'
  'package-lock.json'
)

# ---------- args ----------
MODE="working"
case "${1:-}" in
  --staged)  MODE="staged" ;;
  --update-baseline) MODE="update-baseline" ;;
  --help|-h)
    cat <<EOF
Usage: $0 [--staged|--update-baseline|--help]
  (no flag)   scan the working tree (all files)
  --staged    scan only the staged (about-to-commit) changes
  --update-baseline  regenerate the false-positive baseline
EOF
    exit 0
    ;;
esac

# ---------- helpers ----------
# Hash a line for baseline entries (so reformatting doesn't break it)
hash_line() {
  printf '%s' "$1" | shasum -a 256 | awk '{print $1}' | cut -c1-16
}

# Compute fingerprint of (file, match text) for the baseline
fingerprint() {
  printf '%s' "$1:$2" | shasum -a 256 | awk '{print $1}' | cut -c1-16
}

# Build the list of files to scan
list_files() {
  case "$MODE" in
    staged)
      # Only what is about to be committed.
      git diff --cached --name-only --diff-filter=ACMR 2>/dev/null
      ;;
    working)
      # All candidate files — including gitignored ones. A pre-commit hook only
      # catches what's about to be committed, but a manual scan (the default)
      # should also catch keys lying around in .env.d/ etc.
      if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        git ls-files 2>/dev/null
        git ls-files --others --exclude-standard 2>/dev/null
        # Also include any gitignored-but-text files we know might hold secrets
        # (e.g. .env.d/*.env). Use a hardcoded fallback for these.
        while IFS= read -r f; do echo "$f"; done < <(
          find . -type f \( -name "*.env" -o -name "*.env.*" -o -name "deployer*.env" -o -name "*.key" -o -name "*.pem" -o -name "*.p12" -o -name "*.pfx" \) 2>/dev/null \
            | grep -vE '^\./(node_modules|lib|out|cache|broadcast)/' \
            | sort -u
        )
      else
        # No git repo: walk the filesystem, skipping noise directories.
        find . -type f \
          -not -path './node_modules/*' \
          -not -path './lib/*' \
          -not -path './out/*' \
          -not -path './cache/*' \
          -not -path './broadcast/*' \
          -not -path './.git/*' 2>/dev/null | sort -u
      fi
      ;;
  esac
}

# Check if a path matches any skip glob (simple fnmatch)
should_skip() {
  local path="$1"
  for pat in "${SKIP_GLOBS[@]}"; do
    # shellcheck disable=SC2053
    [[ "$path" == $pat ]] && return 0
  done
  return 1
}

# ---------- main ----------
# Collect files into a temp file (avoids bash-4-only `mapfile` for macOS compat).
FILES_TMP=$(mktemp)
trap 'rm -f "$FILES_TMP" /tmp/secret-scan.tmp' EXIT
list_files > "$FILES_TMP"

# Use gitleaks if available AND we're in a git repo (it needs `git` commands).
# Otherwise fall back to the pure-bash scanner.
use_gitleaks=0
if [[ "$MODE" != "update-baseline" ]] && command -v gitleaks >/dev/null 2>&1; then
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    use_gitleaks=1
  fi
fi

if [[ "$use_gitleaks" -eq 1 ]]; then
  echo "secret-scan: using gitleaks ($(gitleaks version 2>/dev/null | head -1))" >&2
  if [[ "$MODE" == "staged" ]]; then
    gitleaks protect --staged --redact --no-banner 2>&1
  else
    gitleaks detect --redact --no-banner --source . 2>&1
  fi
  exit $?
fi

echo "secret-scan: using built-in scanner" >&2
matches_found=0
new_baseline_entries=()
: > /tmp/secret-scan.tmp

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  [[ ! -f "$file" ]] && continue
  should_skip "$file" && continue
  # Skip binary files
  if file --mime-type "$file" 2>/dev/null | grep -qv 'text/'; then
    continue
  fi

  # Named patterns
  for entry in "${PATTERNS[@]}"; do
    name="${entry%%|*}"
    regex="${entry#*|}"
    # eth-addresses pattern is too noisy (any 20-byte hex) — only flag via
    # the eth-private-key pattern. Skip the loose form.
    if [[ "$name" == "eth-addresses-are-fine" ]]; then
      continue
    fi
    while IFS=: read -r line_no line_text; do
      [[ -z "$line_no" ]] && continue
      fp=$(fingerprint "$file" "$line_text")
      # Check baseline
      if [[ -f "$BASELINE_FILE" ]] && grep -qE "^$fp[[:space:]]" "$BASELINE_FILE"; then
        continue
      fi
      echo "  [$name] $file:$line_no" | tee -a /tmp/secret-scan.tmp
      echo "    $line_text" | tee -a /tmp/secret-scan.tmp
      matches_found=$((matches_found + 1))
      new_baseline_entries+=("$fp  $name  $file:$line_no")
    done < <(grep -nE "$regex" "$file" 2>/dev/null || true)
  done

  # Generic env-style (PRIVATE_KEY=foo etc.) — only check value-like contexts
  while IFS=: read -r line_no line_text; do
    [[ -z "$line_no" ]] && continue
    # Skip false-positive guards
    if echo "$line_text" | grep -qE "$EXCLUDE_FROM_GENERIC_REGEX"; then
      continue
    fi
    fp=$(fingerprint "$file" "$line_text")
    if [[ -f "$BASELINE_FILE" ]] && grep -qE "^$fp[[:space:]]" "$BASELINE_FILE"; then
      continue
    fi
    echo "  [env-var-secret] $file:$line_no" | tee -a /tmp/secret-scan.tmp
    echo "    $line_text" | tee -a /tmp/secret-scan.tmp
    matches_found=$((matches_found + 1))
    new_baseline_entries+=("$fp  env-var-secret  $file:$line_no")
  done < <(grep -nEi "$GENERIC_REGEX" "$file" 2>/dev/null || true)
done < "$FILES_TMP"

# ---------- result ----------
if [[ "$MODE" == "update-baseline" ]]; then
  if [[ ! -f "$BASELINE_FILE" ]]; then
    echo "# Secret-scan baseline. Each line: <fingerprint>  <rule>  <file:line>" > "$BASELINE_FILE"
    echo "# Regenerate with: bash tools/secret-scan.sh --update-baseline" >> "$BASELINE_FILE"
  fi
  for entry in "${new_baseline_entries[@]}"; do
    echo "$entry" >> "$BASELINE_FILE"
  done
  echo "Baseline updated: $BASELINE_FILE" >&2
  exit 0
fi

if [[ "$matches_found" -gt 0 ]]; then
  cat <<EOF >&2

=========================================================
  secret-scan: $matches_found potential secret(s) found
=========================================================
If any of these are FALSE POSITIVES, run:
  bash tools/secret-scan.sh --update-baseline
then re-stage and commit.

If a real secret was committed, rotate it immediately:
  - The deployer key:     delete .env.d/deployer.example.env and create a new wallet
  - SOCIALSCAN_API_KEY:   revoke at https://etherscan.io/apis
  - GitHub tokens:        https://github.com/settings/tokens
  - AWS keys:             https://console.aws.amazon.com/iam/

To bypass this check (NOT RECOMMENDED), use:
  git commit --no-verify
=========================================================
EOF
  exit 1
fi

echo "secret-scan: clean ($MODE)" >&2
exit 0
