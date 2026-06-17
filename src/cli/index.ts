/**
 * Pharos Agent Identity Skill — CLI
 *
 * Usage:
 *   pharos-agent-identity issue [--token-uri <uri>] [--controller <addr>]
 *   pharos-agent-identity verify --subject <addr> --capability <name|hash> [--issuer <addr>]
 *   pharos-agent-identity revoke --subject <addr> --capability <name|hash> --nonce <n> [--issuer-key <key>]
 *   pharos-agent-identity rotate --token-id <id> --new-controller <addr>
 *   pharos-agent-identity hash --capability <name>
 *   pharos-agent-identity sign --issuer-key <key> --subject <addr> --capability <name|hash> [--expires-in <seconds>]
 *   pharos-agent-identity info
 */

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CREDENTIAL_REGISTRY_ABI,
  PHAROS_AGENT_ID_ABI,
  capabilityHash,
  isHexBytes32,
  loadConfig,
  parseAddress,
  type Deployment,
  type Network,
} from "../lib/index.js";

// Re-export for downstream consumers (e.g. integration tests)
export { PHAROS_AGENT_ID_ABI, CREDENTIAL_REGISTRY_ABI };

/** CLI-specific: parse a capability arg as either a 32-byte hex or a name. */
function parseCap(s: string): Hex {
  if (isHexBytes32(s)) return s;
  return capabilityHash(s) as Hex;
}

/** Read a --flag <value> or --flag=value argument. */
function arg(name: string, aliases: string[] = []): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` || aliases.includes(args[i])) {
      return args[i + 1];
    }
    if (args[i]?.startsWith(`--${name}=`)) {
      return args[i]!.slice(`--${name}=`.length);
    }
  }
  return undefined;
}

function usage() {
  console.log(`pharos-agent-identity — Pharos Agent Identity Skill CLI

Usage:
  pharos-agent-identity info
  pharos-agent-identity hash --capability <name>
  pharos-agent-identity issue [--token-uri <uri>] [--controller <addr>]
  pharos-agent-identity verify --subject <addr> --capability <name|hash> [--issuer <addr>]
  pharos-agent-identity revoke --subject <addr> --capability <name|hash> --nonce <n> [--issuer-key <key>]
  pharos-agent-identity rotate --token-id <id> --new-controller <addr>
  pharos-agent-identity sign --issuer-key <key> --subject <addr> --capability <name|hash> [--expires-in <seconds>]

Environment:
  PRIVATE_KEY           wallet private key (for write operations)
  PHAROS_NETWORK        'atlantic' (default) or 'mainnet'
  PHAROS_RPC_URL        override the default RPC URL
`);
}

interface ClientContext {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient> | null;
  account: ReturnType<typeof privateKeyToAccount> | null;
  network: Network;
  deployment: Deployment;
  rpc: string;
  chain: ReturnType<typeof defineChain>;
}

function getClients(): ClientContext {
  const { network, deployment } = loadConfig();
  const rpc = process.env.PHAROS_RPC_URL || network.rpcUrl;
  const publicClient = createPublicClient({ transport: http(rpc) });
  const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex | undefined;
  const account = PRIVATE_KEY ? privateKeyToAccount(PRIVATE_KEY) : null;
  const chain = defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: network.nativeToken,
    rpcUrls: { default: { http: [rpc] } },
  });
  const walletClient = account
    ? createWalletClient({ account, transport: http(rpc), chain })
    : null;
  return { publicClient, walletClient, account, network, deployment, rpc, chain };
}

// ---------- Command implementations ----------

async function cmdInfo() {
  const { networkName, network, deployment } = loadConfig();
  console.log(JSON.stringify({ networkName, network, deployment }, null, 2));
}

async function cmdHash() {
  const cap = arg("capability");
  if (!cap) throw new Error("--capability <name> required");
  console.log(JSON.stringify({ capability: cap, keccak256: capabilityHash(cap) }, null, 2));
}

async function cmdIssue() {
  const { publicClient, walletClient, account, network, deployment, chain } = getClients();
  if (!walletClient || !account) throw new Error("PRIVATE_KEY not set");
  const controller = arg("controller") ? parseAddress(arg("controller")!) : account.address;
  const tokenUri = arg("token-uri") ?? "";

  // Branch on whether the controller is the caller. Avoids `as never` casts that
  // push viem's writeContract into a strict overload requiring an explicit account.
  const hash =
    controller.toLowerCase() === account.address.toLowerCase()
      ? await walletClient.writeContract({
          address: deployment.pharosAgentId,
          abi: PHAROS_AGENT_ID_ABI,
          functionName: "mintSelf",
          args: [tokenUri],
          chain,
          account: account.address,
        })
      : await walletClient.writeContract({
          address: deployment.pharosAgentId,
          abi: PHAROS_AGENT_ID_ABI,
          functionName: "mint",
          args: [controller, tokenUri],
          chain,
          account: account.address,
        });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const tokenId = (await publicClient.readContract({
    address: deployment.pharosAgentId,
    abi: PHAROS_AGENT_ID_ABI,
    functionName: "walletOfAgent",
    args: [controller],
  })) as bigint;
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "issue",
        controller,
        tokenId: tokenId.toString(),
        txHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        explorer: `${network.explorerUrl}tx/${hash}`,
      },
      null,
      2
    )
  );
}

async function cmdVerify() {
  const { publicClient, network, deployment } = getClients();
  const subject = arg("subject");
  const cap = arg("capability");
  if (!subject || !cap) throw new Error("--subject and --capability required");
  const subjectAddr = parseAddress(subject);
  const capHash = parseCap(cap);
  const issuer = arg("issuer");

  const capable = issuer
    ? ((await publicClient.readContract({
        address: deployment.credentialRegistry,
        abi: CREDENTIAL_REGISTRY_ABI,
        functionName: "isCapableFromIssuer",
        args: [subjectAddr, capHash, parseAddress(issuer)],
      })) as boolean)
    : ((await publicClient.readContract({
        address: deployment.credentialRegistry,
        abi: CREDENTIAL_REGISTRY_ABI,
        functionName: "isCapable",
        args: [subjectAddr, capHash],
      })) as boolean);

  const view = (await publicClient.readContract({
    address: deployment.credentialRegistry,
    abi: CREDENTIAL_REGISTRY_ABI,
    functionName: "latestCredential",
    args: [subjectAddr, capHash],
  })) as { issuer: Address; issuedAt: bigint; expiresAt: bigint; revoked: boolean; valid: boolean };

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "verify",
        subject: subjectAddr,
        capability: cap,
        capabilityHash: capHash,
        capable,
        latest: {
          issuer: view.issuer,
          issuedAt: view.issuedAt.toString(),
          expiresAt: view.expiresAt.toString(),
          revoked: view.revoked,
          valid: view.valid,
        },
        network: network.name,
        chainId: network.chainId,
      },
      null,
      2
    )
  );
}

async function cmdRevoke() {
  const { publicClient, network, deployment, chain } = getClients();
  const subject = arg("subject");
  const cap = arg("capability");
  const nonce = arg("nonce");
  if (!subject || !cap || !nonce) throw new Error("--subject, --capability, --nonce required");
  const issuerKey = (arg("issuer-key") || process.env.PRIVATE_KEY) as Hex;
  if (!issuerKey) throw new Error("--issuer-key or PRIVATE_KEY required");

  const issuerAccount = privateKeyToAccount(issuerKey);
  const issuerWallet = createWalletClient({
    account: issuerAccount,
    transport: http(process.env.PHAROS_RPC_URL || network.rpcUrl),
    chain,
  });
  const subjectAddr = parseAddress(subject);
  const capHash = parseCap(cap);
  const nonceBig = BigInt(nonce);

  const hash = await issuerWallet.writeContract({
    address: deployment.credentialRegistry,
    abi: CREDENTIAL_REGISTRY_ABI,
    functionName: "revoke",
    args: [subjectAddr, capHash, nonceBig],
    chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "revoke",
        subject: subjectAddr,
        capability: cap,
        nonce: nonceBig.toString(),
        txHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        explorer: `${network.explorerUrl}tx/${hash}`,
      },
      null,
      2
    )
  );
}

async function cmdRotate() {
  const { publicClient, walletClient, account, network, deployment, chain } = getClients();
  if (!walletClient || !account) throw new Error("PRIVATE_KEY not set");
  const tokenId = arg("token-id");
  const newController = arg("new-controller");
  if (!tokenId || !newController) throw new Error("--token-id and --new-controller required");
  const tokenIdBig = BigInt(tokenId);
  const newAddr = parseAddress(newController);

  const current = (await publicClient.readContract({
    address: deployment.pharosAgentId,
    abi: PHAROS_AGENT_ID_ABI,
    functionName: "ownerOf",
    args: [tokenIdBig],
  })) as Address;
  if (current.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `caller ${account.address} is not the current controller of tokenId ${tokenId} (current: ${current})`
    );
  }

  const hash = await walletClient.writeContract({
    address: deployment.pharosAgentId,
    abi: PHAROS_AGENT_ID_ABI,
    functionName: "rotate",
    args: [tokenIdBig, newAddr],
    chain,
    account: account.address,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "rotate",
        tokenId: tokenIdBig.toString(),
        from: current,
        to: newAddr,
        txHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        explorer: `${network.explorerUrl}tx/${hash}`,
      },
      null,
      2
    )
  );
}

async function cmdSign() {
  const { publicClient, network, deployment } = getClients();
  const issuerKey = arg("issuer-key") as Hex;
  const subject = arg("subject");
  const cap = arg("capability");
  const expiresIn = Number(arg("expires-in") ?? 2_592_000);
  if (!issuerKey || !subject || !cap)
    throw new Error("--issuer-key, --subject, --capability required");
  const issuerAccount = privateKeyToAccount(issuerKey);
  const subjectAddr = parseAddress(subject);
  const capHash = parseCap(cap);
  const issuedAt = BigInt(Math.floor(Date.now() / 1000));
  const expiresAt = issuedAt + BigInt(expiresIn);
  const nonce = (await publicClient.readContract({
    address: deployment.credentialRegistry,
    abi: CREDENTIAL_REGISTRY_ABI,
    functionName: "issuerNonce",
    args: [issuerAccount.address],
  })) as bigint;
  const digest = (await publicClient.readContract({
    address: deployment.credentialRegistry,
    abi: CREDENTIAL_REGISTRY_ABI,
    functionName: "hashTypedData",
    args: [issuerAccount.address, subjectAddr, capHash, issuedAt, expiresAt, nonce],
  })) as Hex;
  const signature = await issuerAccount.sign({ hash: digest });
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "sign",
        issuer: issuerAccount.address,
        subject: subjectAddr,
        capability: cap,
        capabilityHash: capHash,
        issuedAt: issuedAt.toString(),
        expiresAt: expiresAt.toString(),
        nonce: nonce.toString(),
        digest,
        signature,
        submitCommand: `cast send ${
          deployment.credentialRegistry
        } "issue(address,address,bytes32,uint64,uint64,uint256,bytes)" ${issuerAccount.address} ${subjectAddr} ${capHash} ${issuedAt} ${expiresAt} ${nonce} ${signature} --rpc-url ${
          process.env.PHAROS_RPC_URL || network.rpcUrl
        } --private-key <SUBMITTER_KEY>`,
      },
      null,
      2
    )
  );
}

// ---------- Main ----------

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === "--help" || cmd === "-h") {
    usage();
    return;
  }
  switch (cmd) {
    case "info":
      return cmdInfo();
    case "hash":
      return cmdHash();
    case "issue":
      return cmdIssue();
    case "verify":
      return cmdVerify();
    case "revoke":
      return cmdRevoke();
    case "rotate":
      return cmdRotate();
    case "sign":
      return cmdSign();
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
