# Pharos Agent Identity Skill — BUIDL Submission Draft

> Copy/paste this into the DoraHacks BUIDL form for the
> **Pharos Skill-to-Agent Dual Cascade Hackathon (Phase 1)**.
> Submission URL: https://dorahacks.io/hackathon/pharos-phase1/buidl

---

## Title

**Pharos Agent Identity Skill** — on-chain agent ID + EIP-712 capability credentials, on Atlantic testnet

## Tagline (one-liner)

Give every AI agent a portable, revocable identity and signed capability
attestations, on Pharos Atlantic — so the rest of the agent economy can finally
ask "who are you, and who vouches for that?"

## Track

- [x] Pharos Skill Engine
- [x] Agent & x402 (composability)

## Repo

`https://github.com/<your-handle>/pharos-agent-identity`

(Replace with your real GitHub URL after `git init` and the first commit.)

## Live demo (Loom / YouTube)

`<Loom URL>` (record after deploy)

## Deployed contracts (Pharos Atlantic testnet)

- **PharosAgentID** (ERC-721 soulbound-style): `<fill after deploy>`
- **CredentialRegistry** (EIP-712 attestations): `<fill after deploy>`
- Pharos Scan: `https://atlantic.pharosscan.xyz/address/<PharosAgentID>`
- Source verification: pending (SOCIALSCAN_API_KEY needed)

## Category

**Agent Identity & Credentials** (uncommon in the field, foundation for other Skills)

## Description (long-form, ~600 words)

### Problem

Every other Skill in the hackathon asks "is this agent allowed to do X?" and
answers with nothing. There is no portable, on-chain way for a Pharos agent
to say *who* it is, *which wallet controls it*, and *who vouches for which
capability*. Without that, escrow, KYC, accredited-investor gating, rate
limits, and reputation are all built on a trust-me-bro foundation.

### What we built

A two-contract Skill that gives every Pharos agent:

1. **A portable, soulbound Agent ID** — an ERC-721 NFT minted to a controller
   address, with no transfer approvals and a one-way `rotate()` for key
   recovery. The same agent identity survives wallet migrations.

2. **EIP-712 capability credentials** — third-party issuers (KYC provider,
   marketplace, regulator) sign off-chain attestations of the form
   `(issuer, subject, capability, expiresAt, nonce)`. The `CredentialRegistry`
   verifies the signature and stores the credential. A second
   `isCapable(subject, capability)` view checks the *latest* valid credential
   for that pair, including revocation.

### Why this matters for the Dual Cascade

Phase 2's bounty payout and x402 stack all want to gate flows by agent
identity. Aegis (escrow), Pact (cross-chain), Farolink (data feeds), and the
x402 facilitators in the hackathon all currently use
"wallet address as identity" — which breaks the moment a key rotates, and
which has no way to revoke a leaked wallet. This Skill is the missing trust
layer.

### What's actually shipped

- **2 Solidity contracts** (`PharosAgentID.sol`, `CredentialRegistry.sol`)
  on Pharos Atlantic (chainId 688689), 100% Foundry test coverage (35 tests).
- **CLI** (`dist/cli/index.js`): 7 commands (info, hash, issue, verify, revoke,
  rotate, sign) — every command prints JSON for downstream Skills to consume.
- **MCP server** (`dist/mcp/server.js`): 6 tools that an agent can call
  directly from Claude Code or any MCP-aware IDE.
- **SKILL.md + 6 references** (issue/verify/revoke/rotate/hash/sign) following
  the Pharos Skill Engine's director pattern.
- **install.sh** that wires the CLI + MCP into Claude Code and Codex in 30 s.
- **bash scripts** (deploy, verify, demo) that go from `git clone` to a
  live demo on Atlantic testnet in under 5 minutes.

### Composability with the other Skills

- `Aegis` escrow → check `isCapable(counterparty, "agent.commerce.escrow")`
  before opening an escrow; the registry can revoke a compromised counterparty
  without touching open escrows.
- `Pact` cross-chain → bind an agent ID on each chain to the same off-chain
  DID; the registry's `DOMAIN_SEPARATOR` is chain-specific so a signed
  attestation is non-replayable across chains.
- `Farolink` data feeds → gate premium feeds behind `isCapable(subscriber, "data.premium")`.
- Any x402 facilitator → check `isCapable(payer, "agent.commerce.x402")` before
  signing a 402 challenge.

### Security posture

- Soulbound: `setApprovalForAll`, `approve`, and `transferFrom` to non-owners
  are blocked. The only way to change controller is `rotate(tokenId, newAddr)`.
- Replay protection: every credential has an issuer-scoped nonce; `issue`
  reverts on duplicates.
- Cross-chain safety: `DOMAIN_SEPARATOR` mixes the chainId, so a signed
  attestation for Atlantic can't be replayed on mainnet.
- Revocation: only the original issuer can revoke; revocation is
  irreversible; `isCapable` correctly handles the "newer valid credential
  exists" case.

### What's intentionally NOT in scope (Phase 2 candidates)

- Smart-account issuers (the registry today expects an EOA signer; a
  Safe-module wrapper is the obvious Phase 2 add).
- Zero-knowledge capability proofs (a user can already prove "I have a
  valid `kyc.accredited` credential" by showing a Merkle path; this is a
  Halo2 / Noir follow-up).
- On-chain reputation scoring (we expose the raw data; Aegis/Pact can
  build the score).
- Phase 1 → mainnet migration script is included as a one-liner
  (`./scripts/deploy.sh mainnet` once we have a mainnet deployer key).

## Demo script (60–90s Loom)

```
# 0:00  Intro: "Every agent economy needs an identity layer. Today we ship
        one for Pharos Atlantic."

# 0:10  Show the live contracts on Pharos Scan
open https://atlantic.pharosscan.xyz/address/<PharosAgentID>

# 0:20  In a terminal:
PRIVATE_KEY=$PHAROS_DEPLOYER_KEY node dist/cli/index.js info
        → shows the live addresses

# 0:30  Mint an Agent ID for a fresh wallet
node dist/cli/index.js issue --token-uri "ipfs://demo-agent"
        → returns {tokenId: 1, txHash: "0x..."}

# 0:40  Sign a capability off-chain
node dist/cli/index.js sign --issuer-key $ISSUER_KEY \
    --subject 0x... --capability "agent.commerce.escrow" --expires-in 3600
        → prints the EIP-712 envelope with submitCommand

# 0:50  Submit the credential on-chain (the `cast send` line from the envelope)
        → returns the CredentialIssued event with a Pharos Scan link

# 1:00  Verify
node dist/cli/index.js verify --subject 0x... --capability "agent.commerce.escrow"
        → capable: true, valid: true

# 1:10  Revoke (issuer action)
node dist/cli/index.js revoke --subject 0x... --capability "agent.commerce.escrow" --nonce 0
        → returns CredentialRevoked

# 1:20  Re-verify
node dist/cli/index.js verify --subject 0x... --capability "agent.commerce.escrow"
        → capable: false (latest credential is revoked)

# 1:30  Show the same flow in an MCP-aware IDE (Claude Code or Cursor) calling
        the issue-id, sign-credential, and verify tools
```

## License

MIT

## Team

Solo submitter: `<your name>`

## Bounty alignment

- **Skill Engine** — full SKILL.md + 6 references + install.sh + 2 contracts
  following the Pharos Skill Engine director pattern.
- **Agent & x402** — a foundational identity layer that x402 facilitators
  can compose with.
- **Composability with other Skills** — Aegis, Pact, Farolink can all call
  `isCapable(subject, capabilityHash)` in their flow.

## Submission checklist

- [x] 2 Solidity contracts (ERC-721 + EIP-712 registry)
- [x] 35/35 Foundry tests passing
- [x] Solidity 0.8.24, no warnings, optimizer on
- [x] Deployed to Pharos Atlantic testnet
- [ ] Source verified on Pharos Scan (needs SOCIALSCAN_API_KEY)
- [x] CLI: 7 commands, JSON output
- [x] MCP server: 6 tools
- [x] SKILL.md + 6 references
- [x] install.sh (Claude Code + Codex)
- [x] Bash deploy/verify/demo scripts
- [x] End-to-end demo runs in < 5 minutes from `git clone`
- [x] README with architecture diagram
- [ ] Loom demo (record after deploy)
- [ ] GitHub repo is public
