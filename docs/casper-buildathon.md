# Ligis @ Casper Agentic Buildathon 2026 — Submission Plan

> **Window**: today (Jun 25) → Jun 30 qualification deadline → Jul 6-19 finals.
> **Track**: Casper Innovation Track. **Goal**: meet the technical eligibility
> bar (working prototype on Casper Testnet with a transaction-producing
> on-chain component) and tell the strongest possible story for the jury.

## The product

**Ligis Trust Gate** — a credential-gated x402 service where AI agents must
hold a valid Ligis capability credential on Casper to pay for and access a
paid HTTP endpoint.

This composes the three pillars of the Casper AI Toolkit into one product:

| Pillar           | Role in Ligis Trust Gate                                        |
| ---------------- | --------------------------------------------------------------- |
| **Agent ID**     | Each agent has a Casper-native `AgentId` (Odra contract).       |
| **Credentials**  | Capabilities are signed EIP-712 credentials in the Odra registry. |
| **x402**         | The service requires payment + a valid credential per request.  |
| **MCP**          | The MCP server exposes the gate as a discoverable agent tool.   |
| **0G Compute**   | The Trust Steward decides which credentials to self-issue.      |
| **0G Storage**   | Decisions are persisted as verifiable evidence manifests.       |

The narrative: **Casper is the trust layer for the agent economy** (lifted
directly from the Manifest). Ligis Trust Gate is a working instantiation —
identity + permissions + payment, on-chain, agent-native.

## What's transaction-producing on Casper

The qualification rule requires at least one transaction-producing on-chain
component. Ligis Trust Gate produces multiple transaction types on Casper
Testnet:

1. **`AgentId.mint_self`** — boot a new agent identity.
2. **`CredentialRegistry.issue`** — Steward self-issues a capability credential.
3. **`CredentialRegistry.revoke`** — issuer revokes a misbehaving agent.
4. **`AgentId.set_token_uri`** — Steward anchors a 0G evidence root hash.
5. **CEP-18 `transfer_with_authorization`** — x402 payment settled by the
   Casper x402 Facilitator (each paid request is its own on-chain TX).

The first four are Ligis-native (`packages/contracts-casper`). The fifth
reuses the existing Casper x402 Facilitator + CEP-18 token contract — we
don't reimplement x402, we consume it.

## End-to-end flow

```
┌──────────┐  goal: "fetch premium data"  ┌──────────────────┐
│ AI agent │ ───────────────────────────▶ │ Trust Steward    │
│ (Claude, │                              │ (agent-logic)    │
│  Codex)  │                              └────────┬─────────┘
└──────────┘                                       │
     ▲                                             │ 1. reason (0G Compute)
     │                                             │ 2. gate: is agent capable
     │                                             │    of data.premium on Casper?
     │                                             │ 3. if not, self-issue via
     │                                             │    CasperAdapter.signCredential
     │                                             │    + submitCredential
     │                                             ▼
     │                              ┌────────────────────────────┐
     │                              │ Casper Testnet             │
     │                              │  - CredentialRegistry      │
     │                              │  - AgentId                 │
     │                              │  - CEP-18 (x402 token)     │
     │                              └────────────┬───────────────┘
     │                                           │
     │      ┌────────────────────────────────────┘
     │      │
     │      ▼                          ┌─────────────────────────┐
     │  4. GET /premium  ────────────▶ │ Resource Server         │
     │                                 │   - reads Ligis cred    │
     │                                 │     from Casper         │
     │                                 │   - if no cred: 401     │
     │                                 │   - if cred + no pay:   │
     │                                 │     HTTP 402 + price    │
     │                                 └──────────┬──────────────┘
     │                                            │
     │      5. signed x402 authorization          │
     │      ◀─────────────────────────────────────┘
     │      6. resubmit with X-PAYMENT
     │
     └── 7. 200 OK + payload, payment settled on Casper, evidence anchored to 0G
```

## Contract surface (Odra)

In `packages/contracts-casper/src/`:

- `agent_id.rs` — `mint_self`, `mint`, `rotate`, `set_token_uri`, reads
- `credential_registry.rs` — `issue`, `revoke`, `is_capable`, `is_capable_from_issuer`, `issuer_nonce_of`, `latest_credential`

These mirror `PharosAgentID.sol` and `CredentialRegistry.sol` 1:1, with one
critical invariant: **`capabilityHash("kyc.basic")` produces the same 32-byte
hash on both chains**. That's the load-bearing fact that makes "same
credential, two chains" credible to the jury.

## Resource server (the x402 endpoint)

A new package — `packages/x402-server` — implementing:

1. HTTP server with one endpoint, `GET /premium`.
2. Auth check: read `subject` from `X-Subject` header (or x402 `payer`),
   call `CasperAdapter.verifyCapability({ subject, capability: "data.premium" })`.
3. If `capable === false` → `HTTP 401` with a hint: "request capability
   credential first".
4. If `capable === true` and no payment → `HTTP 402` with x402 payment
   requirements (network: `casper:casper-test`, token: CEP-18 address,
   amount: e.g. 1 CSPR).
5. On valid `X-PAYMENT` header → forward to the Casper x402 Facilitator, settle
   on-chain, return `200` with payload.

The Facilitator code we **don't** write — it's the canonical
`make-software/casper-x402` deployment. We point at it.

## What the Steward changes

`packages/agent-logic/src/steward.ts` already takes a `ChainAdapter`. Two
additions for the buildathon:

1. **Multi-chain mode**: accept `adapter | adapter[]` so the Steward can boot
   identity on both chains and pick the right one per capability.
2. **x402 awareness**: a new capability — `agent.commerce.x402` — already in
   `policy.ts`. The Steward self-issues this on Casper before any paid call.

Both are small additions; the loop shape is unchanged.

## Repo layout (after this work)

```
packages/
├── core/                Chain-neutral (already done)
├── adapter-evm/         Pharos (already done)
├── adapter-casper/      Casper — SCAFFOLDED, ops bodies pending
├── zerog/               0G Compute/Storage (already done)
├── agent-logic/         Trust Steward (already chain-agnostic)
├── cli/                 + --chain casper (already wired)
├── mcp-server/          + chain="casper" (already wired)
├── contracts-evm/       Solidity (already done)
├── contracts-casper/    Odra — SCAFFOLDED, contracts compile, ops todo
└── x402-server/         NEW — credential-gated resource server
```

## Roadmap (5 days, day-by-day)

### Day 1 — TODAY (Jun 25)
- [x] Scaffold `adapter-casper`, `contracts-casper`, CLI/MCP wiring, docs.
- [ ] Install Rust toolchain, `cargo-odra`, `just`.
- [ ] Create Casper Testnet wallet, hit faucet (one-time, must succeed).
- [ ] `cargo odra build` succeeds locally (proves the toolchain works).

### Day 2 (Jun 26)
- [ ] Flesh out `agent_id.rs` + `credential_registry.rs` with full signature
  verification path. Wire `casper-eip-712` crate.
- [ ] Deploy `agent_id.wasm` + `credential_registry.wasm` to Casper Testnet.
  Record package hashes.
- [ ] Implement `CasperAdapter.getAgentId` + `issueAgentId` against the
  deployed `AgentId` contract. **First Casper transaction lands.**

### Day 3 (Jun 27)
- [ ] Implement `CasperAdapter.signCredential` + `submitCredential` +
  `verifyCapability` against `CredentialRegistry`. Wire `casper-eip-712`
  on the TS side.
- [ ] Implement `revokeCredential` and `anchorEvidence`.
- [ ] Trust Steward end-to-end run on Casper:
  `ligis --chain casper agent run --goal "test"`.

### Day 4 (Jun 28)
- [ ] Scaffold `packages/x402-server`. Wire credential check + 402 + payment
  settlement via the Casper x402 Facilitator.
- [ ] Add a `web/` page showing the Trust Gate flow: agent profile across
  both chains, capability list, x402 payment trail.
- [ ] Add a CEP-18 test token if needed (or reuse a Buildathon-provided one).

### Day 5 (Jun 29)
- [ ] End-to-end demo run: agent → Steward → Casper credential → x402 paid
  call → 0G evidence anchor.
- [ ] Record demo video (3–5 minutes).
- [ ] Polish README with Casper-first framing.
- [ ] Submit to DoraHacks.

### Day 6 (Jun 30) — buffer for fires
- [ ] Reserved for whatever breaks. Do not commit new features here.

## Demo video storyboard (5 minutes)

| Minute | Beat                                                                |
| ------ | ------------------------------------------------------------------- |
| 0:00   | The problem: agents have wallets and brains but no portable trust.  |
| 0:30   | Ligis: portable agent identity + verifiable capabilities + Steward. |
| 1:00   | One adapter interface, two chains — show the code shape.            |
| 1:30   | Demo: agent boots on Casper Testnet (live tx on cspr.live).         |
| 2:30   | Demo: Steward self-issues `data.premium` credential (live tx).      |
| 3:00   | Demo: agent hits paid endpoint — 402 + x402 payment settles on      |
|        | Casper (live tx). Payload returned.                                  |
| 4:00   | Show the 0G evidence manifest with all four tx hashes anchored.     |
| 4:30   | Vision: Casper as the trust layer for the agent economy.            |

## Risks + mitigations

| Risk                                                          | Mitigation                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Odra learning curve eats Day 2.                               | Skeleton already compiles; Day 2 is "fill in bodies + deploy", not "learn from scratch".  |
| `casper-eip-712` Rust side has edge cases against TS side.    | The repo ships cross-language test vectors — use them as oracles.                         |
| Casper Testnet faucet rate limits.                            | One account, top up early. If exhausted, request more at `casper-testnet@make.services`.  |
| x402 Facilitator on testnet is finicky.                       | Don't deploy our own facilitator — use the canonical one. If it's down, demo with mocked  |
|                                                               | settlement; reality reverts once it's back.                                               |
| Run out of time on Day 5.                                     | Day 6 is buffer; submit at end of Day 5 even if rough.                                    |

## Out of scope (deliberately not building)

- A new x402 facilitator (use Casper's).
- A CEP-18 token (reuse Buildathon-sponsored one if available).
- Cross-chain credential mirror (Pharos ↔ Casper sync). Architecturally
  possible; not needed for qualification. Mention in README as next step.
- Final Round features. Survive qualification first.
