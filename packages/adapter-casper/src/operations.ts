/**
 * Casper on-chain operations.
 *
 * Mirrors the shape of packages/adapter-evm/src/operations.ts. The two
 * READ paths (verifyCapability, getAgentId) talk to casper-js-sdk; the
 * WRITE paths require the Odra contracts to be deployed and need to build
 * + submit `TransactionV1` payloads.
 *
 * What's wired today:
 *   - signCredential (full EIP-712 digest construction + secp256k1 sign)
 *
 * What's stubbed (clear next-step in each error):
 *   - getAgentId, issueAgentId, rotateAgentId
 *   - verifyCapability, submitCredential, revokeCredential, anchorEvidence
 *
 * The stubs are intentionally precise so each is a discrete, testable unit
 * of work once the contracts deploy.
 */
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { capabilityHash, parseCapability } from "@ligis/core";
import type { CasperClientContext } from "./client.js";
import { buildCredentialDigest, type CredentialMessage } from "./eip712.js";

const DEFAULT_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

function notImplemented(what: string): never {
  throw new Error(
    `Casper adapter: ${what} not yet implemented. ` +
      `Deploy packages/contracts-casper first, set LIGIS_CASPER_* env vars, then wire this op.`,
  );
}

/** Convert an 0x-prefixed hex string to bytes. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Convert bytes to 0x-prefixed hex. */
function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}

/** Derive the secp256k1 Ethereum-style address from a 32-byte private key. */
function addressFromSecpKey(privateKeyHex: string): string {
  const priv = hexToBytes(privateKeyHex);
  const pub = secp256k1.getPublicKey(priv, false); // uncompressed: 0x04 || X || Y
  const hash = keccak_256(pub.slice(1));            // skip the 0x04 prefix
  return bytesToHex(hash.slice(-20));
}

// ---------- identity ----------

export async function getAgentId(
  _ctx: CasperClientContext,
  _controller: string,
): Promise<string | null> {
  // Casper read: rpc.queryGlobalStateByStateHash(<state-root>, "<package-hash>/wallet_of_agent/<account-hash>")
  notImplemented("getAgentId");
}

export async function issueAgentId(
  _ctx: CasperClientContext,
  _opts: { controller?: string; tokenUri?: string },
): Promise<{ agentId: string; controller: string; txHash: string; blockNumber: string }> {
  // Build TransactionV1 targeting agent_id contract, entry_point "mint_self".
  // Sign with LIGIS_CASPER_KEY_PATH (PEM), putTransactionV1, await execution result.
  notImplemented("issueAgentId");
}

export async function rotateAgentId(
  _ctx: CasperClientContext,
  _opts: { agentId: string; newController: string },
): Promise<{ txHash: string; blockNumber: string }> {
  notImplemented("rotateAgentId");
}

// ---------- credentials ----------

export async function verifyCapability(
  _ctx: CasperClientContext,
  _opts: { subject: string; capability: string; issuer?: string },
): Promise<{
  capable: boolean;
  capabilityHash: `0x${string}`;
  latest: { issuer: string; issuedAt: string; expiresAt: string; revoked: boolean; valid: boolean };
}> {
  // Casper read: queryGlobalState on credential_registry's `latest` dictionary.
  // Key encoding: keccak256(subject_bytes || capability_hash_bytes).
  notImplemented("verifyCapability");
}

/**
 * Build + sign an EIP-712 credential. The same wire format as the EVM
 * adapter — the only difference is the domain separator (Casper-native fields).
 *
 * Note: nonce is read from chain in the full path; until verifyCapability is
 * wired, we default to "0" and document this in the result. The signature
 * itself is valid as soon as the registry deploys.
 */
export async function signCredential(
  ctx: CasperClientContext,
  opts: { issuerKey: string; subject: string; capability: string; expiresInSeconds?: number },
): Promise<{
  issuer: string;
  subject: string;
  capabilityHash: `0x${string}`;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  digest: `0x${string}`;
  signature: string;
}> {
  const capHash = parseCapability(opts.capability);
  const issuer = addressFromSecpKey(opts.issuerKey);
  const issuedAt = BigInt(Math.floor(Date.now() / 1000));
  const expiresAt = issuedAt + BigInt(opts.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS);

  // TODO: once verifyCapability is wired, read the live issuer nonce here.
  const nonce = "0";

  const message: CredentialMessage = {
    issuer,
    subject: opts.subject,
    capabilityHash: capHash,
    issuedAt: issuedAt.toString(),
    expiresAt: expiresAt.toString(),
    nonce,
  };

  const digest = buildCredentialDigest(ctx.config, message);

  // secp256k1 sign(digest, privKey) — returns { r, s, recovery } in noble's API
  const priv = hexToBytes(opts.issuerKey);
  const sig = secp256k1.sign(hexToBytes(digest), priv);
  const compact = sig.toCompactRawBytes();
  // EIP-2098 / EVM-style 65-byte sig: r(32) || s(32) || v(1) where v = 27 + recovery
  const fullSig = new Uint8Array(65);
  fullSig.set(compact, 0);
  fullSig[64] = 27 + (sig.recovery ?? 0);
  const signature = bytesToHex(fullSig);

  return {
    issuer,
    subject: opts.subject,
    capabilityHash: capHash,
    issuedAt: issuedAt.toString(),
    expiresAt: expiresAt.toString(),
    nonce,
    digest,
    signature,
  };
}

export async function submitCredential(
  _ctx: CasperClientContext,
  _signed: {
    issuer: string;
    subject: string;
    capabilityHash: `0x${string}`;
    issuedAt: string;
    expiresAt: string;
    nonce: string;
    signature: string;
  },
): Promise<{ txHash: string; blockNumber: string }> {
  // putTransactionV1 → credential_registry.issue(issuer, subject, capHash, issuedAt, expiresAt, nonce, signature)
  notImplemented("submitCredential");
}

export async function revokeCredential(
  _ctx: CasperClientContext,
  _opts: { subject: string; capability: string; nonce: string; issuerKey?: string },
): Promise<{ txHash: string; blockNumber: string }> {
  notImplemented("revokeCredential");
}

// ---------- evidence anchoring ----------

export async function anchorEvidence(
  _ctx: CasperClientContext,
  _opts: { agentId: string; uri: string },
): Promise<{ txHash: string; blockNumber: string }> {
  // putTransactionV1 → agent_id.set_token_uri(token_id, uri)
  notImplemented("anchorEvidence");
}

// Re-exports for tests / sibling modules
export { capabilityHash };
