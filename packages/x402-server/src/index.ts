/**
 * Ligis Trust Gate — credential-gated x402 resource server.
 *
 * One endpoint, three states:
 *
 *   GET /premium
 *     ├─ no valid Ligis credential          → 401 with hint
 *     ├─ has credential, no X-PAYMENT       → 402 with x402 PaymentRequirements
 *     └─ has credential + valid X-PAYMENT   → 200 with payload, payment settled
 *
 * Settlement uses the canonical Casper x402 Facilitator
 * (`make-software/casper-x402`). We do NOT implement payment verification or
 * settlement ourselves — we forward to the facilitator.
 *
 * Use this alongside the Trust Steward: when the Steward determines an agent
 * needs `agent.commerce.x402`, it self-issues the credential on Casper, then
 * the agent can hit this endpoint.
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { CasperAdapter } from "@ligis/adapter-casper";

const PORT = Number(process.env.PORT ?? 4040);

/** x402 PaymentRequirements per the protocol spec. */
interface PaymentRequirements {
  scheme: "exact";
  network: string;            // CAIP-2: "casper:casper-test"
  maxAmountRequired: string;  // smallest-unit decimal string
  resource: string;           // resource URL
  description: string;
  mimeType: string;
  payTo: string;              // recipient (account hash hex)
  maxTimeoutSeconds: number;
  asset: string;              // CEP-18 token contract package hash
  extra?: Record<string, unknown>;
}

// ---------- Config ----------

const CONFIG = {
  /** The capability gate. Must match a key in @ligis/agent-logic policy. */
  capability: process.env.LIGIS_GATE_CAPABILITY ?? "data.premium",
  /** Cost per request in the smallest unit of the configured asset. */
  priceSmallestUnit: process.env.LIGIS_GATE_PRICE ?? "1000000",
  /** CEP-18 token used for payment (package hash). */
  asset:
    process.env.LIGIS_GATE_ASSET ??
    process.env.LIGIS_CASPER_X402_TOKEN ??
    "",
  /** Recipient account hash for payment. */
  payTo: process.env.LIGIS_GATE_PAY_TO ?? "",
  /** Casper x402 Facilitator URL for verification + settlement. */
  facilitatorUrl: process.env.LIGIS_FACILITATOR_URL ?? "http://localhost:4022",
};

const adapter = new CasperAdapter();
const app = new Hono();

// ---------- Routes ----------

app.get("/", (c) => c.json({
  service: "Ligis Trust Gate",
  capability: CONFIG.capability,
  chain: adapter.chainId,
  endpoint: "/premium",
}));

app.get("/health", (c) => c.json({ ok: true }));

app.get("/premium", async (c) => {
  const subject = c.req.header("X-Subject");
  if (!subject) {
    return c.json({ ok: false, error: "missing X-Subject header (the agent's Casper account hash)" }, 400);
  }

  // 1. Gate: does this subject hold a valid Ligis credential?
  let capable = false;
  try {
    const check = await adapter.verifyCapability({ subject, capability: CONFIG.capability });
    capable = check.capable;
  } catch (err) {
    return c.json({
      ok: false,
      error: "credential check failed",
      detail: err instanceof Error ? err.message : String(err),
      hint: "ensure LIGIS_CASPER_CREDENTIAL_REGISTRY is set and the contract is deployed",
    }, 503);
  }
  if (!capable) {
    return c.json({
      ok: false,
      error: "not authorized",
      requiredCapability: CONFIG.capability,
      hint: `request a credential for ${CONFIG.capability} via Trust Steward, then retry`,
    }, 401);
  }

  // 2. Payment: do we have an X-PAYMENT header?
  const payment = c.req.header("X-PAYMENT");
  if (!payment) {
    const requirements = paymentRequirements(c.req.url);
    return c.json({
      x402Version: 1,
      error: "X-PAYMENT header is required",
      accepts: [requirements],
    }, 402);
  }

  // 3. Settle via facilitator
  const verifyResult = await callFacilitator("verify", { payment, requirements: paymentRequirements(c.req.url) });
  if (!verifyResult.ok) {
    return c.json({ ok: false, error: "payment verification failed", detail: verifyResult.error }, 402);
  }
  const settleResult = await callFacilitator("settle", { payment, requirements: paymentRequirements(c.req.url) });
  if (!settleResult.ok) {
    return c.json({ ok: false, error: "payment settlement failed", detail: settleResult.error }, 402);
  }

  // 4. Deliver
  c.header("X-PAYMENT-RESPONSE", settleResult.txHash ?? "");
  return c.json({
    ok: true,
    capability: CONFIG.capability,
    subject,
    payload: examplePremiumPayload(),
    settled: { txHash: settleResult.txHash, chain: adapter.chainId },
  });
});

// ---------- Helpers ----------

function paymentRequirements(resource: string): PaymentRequirements {
  if (!CONFIG.asset || !CONFIG.payTo) {
    throw new Error(
      "Trust Gate not fully configured: set LIGIS_GATE_ASSET (CEP-18 package hash) and LIGIS_GATE_PAY_TO (account hash).",
    );
  }
  return {
    scheme: "exact",
    network: `casper:${adapter.chainId === "casper-mainnet" ? "casper" : "casper-test"}`,
    maxAmountRequired: CONFIG.priceSmallestUnit,
    resource,
    description: `Ligis Trust Gate — ${CONFIG.capability}`,
    mimeType: "application/json",
    payTo: CONFIG.payTo,
    maxTimeoutSeconds: 60,
    asset: CONFIG.asset,
  };
}

async function callFacilitator(
  path: "verify" | "settle",
  body: unknown,
): Promise<{ ok: boolean; txHash?: string; error?: string }> {
  try {
    const res = await fetch(`${CONFIG.facilitatorUrl}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `facilitator ${path} ${res.status}: ${text}` };
    }
    const data = (await res.json()) as { txHash?: string };
    return { ok: true, txHash: data.txHash };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function examplePremiumPayload() {
  return {
    note: "Premium content. Replace this with your real paid data feed.",
    ts: new Date().toISOString(),
  };
}

// ---------- Entry point ----------

console.log(`Ligis Trust Gate starting on :${PORT}`);
console.log(`  capability:   ${CONFIG.capability}`);
console.log(`  chain:        ${adapter.chainId}`);
console.log(`  facilitator:  ${CONFIG.facilitatorUrl}`);
serve({ fetch: app.fetch, port: PORT });
