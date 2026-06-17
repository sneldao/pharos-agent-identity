/**
 * Pharos Identity Skill — CLI
 *
 * Usage:
 *   pharos-identity issue [--token-uri <uri>] [--controller <addr>]
 *   pharos-identity verify --subject <addr> --capability <name|hash> [--issuer <addr>]
 *   pharos-identity revoke --subject <addr> --capability <name|hash> --nonce <n> [--issuer-key <key>]
 *   pharos-identity rotate --token-id <id> --new-controller <addr>
 *   pharos-identity hash --capability <name>
 *   pharos-identity sign --issuer-key <key> --subject <addr> --capability <name|hash> [--expires-in <seconds>]
 *   pharos-identity info
 */
import { createPublicClient, createWalletClient, defineChain, http, toBytes, toHex, } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { keccak_256 } from "@noble/hashes/sha3";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = (() => {
    // When run from the project (e.g. `node dist/cli/index.js`), the assets/ folder
    // is at the project root, not next to the compiled file. We try multiple candidates
    // and fall back to the cwd.
    const candidates = [
        path.resolve(__dirname, "..", ".."), // dist/cli -> project root
        path.resolve(__dirname, ".."), // cli -> project root (when running from src)
        process.cwd(), // current working directory
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(c, "assets", "networks.json"))) {
            return c;
        }
    }
    return candidates[0];
})();
function loadConfig() {
    const networksFile = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "assets", "networks.json"), "utf-8"));
    const networkName = process.env.PHAROS_NETWORK || networksFile.defaultNetwork;
    const network = networksFile.networks[networkName];
    if (!network) {
        throw new Error(`Unknown network: ${networkName}`);
    }
    // Match deployment by chainId (so a custom anvil chain 31337 can be deployed to
    // and the CLI will still find the right deployment entry by chainId).
    let deployment;
    for (const [key, dep] of Object.entries(networksFile.deployment)) {
        if (dep.chainId === network.chainId) {
            deployment = dep;
            break;
        }
    }
    if (!deployment) {
        // Fallback: try matching by key name (legacy).
        deployment = networksFile.deployment[networkName];
    }
    if (!deployment) {
        throw new Error(`No deployment recorded for chainId ${network.chainId} (network: ${networkName}). ` +
            `Run scripts/deploy.sh first.`);
    }
    return { networksFile, networkName, network, deployment };
}
function capabilityHash(name) {
    return toHex(keccak_256(toBytes(name)));
}
function parseAddress(s) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(s)) {
        throw new Error(`Invalid address: ${s}`);
    }
    return s;
}
function parseCap(s) {
    if (/^0x[0-9a-fA-F]{64}$/.test(s))
        return s;
    return capabilityHash(s);
}
function arg(name, aliases = []) {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === `--${name}` || aliases.includes(args[i])) {
            return args[i + 1];
        }
        if (args[i]?.startsWith(`--${name}=`)) {
            return args[i].slice(`--${name}=`.length);
        }
    }
    return undefined;
}
function usage() {
    console.log(`pharos-identity — Pharos Identity Skill CLI

Usage:
  pharos-identity info
  pharos-identity hash --capability <name>
  pharos-identity issue [--token-uri <uri>] [--controller <addr>]
  pharos-identity verify --subject <addr> --capability <name|hash> [--issuer <addr>]
  pharos-identity revoke --subject <addr> --capability <name|hash> --nonce <n> [--issuer-key <key>]
  pharos-identity rotate --token-id <id> --new-controller <addr>
  pharos-identity sign --issuer-key <key> --subject <addr> --capability <name|hash> [--expires-in <seconds>]

Environment:
  PRIVATE_KEY           wallet private key (for write operations)
  PHAROS_NETWORK        'atlantic' (default) or 'mainnet'
  PHAROS_RPC_URL        override the default RPC URL
`);
}
// ---------- Minimal ABI ----------
const PHAROS_AGENT_ID_ABI = [
    {
        type: "function",
        name: "mintSelf",
        stateMutability: "nonpayable",
        inputs: [{ name: "tokenURI", type: "string" }],
        outputs: [{ name: "tokenId", type: "uint256" }],
    },
    {
        type: "function",
        name: "mint",
        stateMutability: "nonpayable",
        inputs: [
            { name: "controller", type: "address" },
            { name: "tokenURI", type: "string" },
        ],
        outputs: [{ name: "tokenId", type: "uint256" }],
    },
    {
        type: "function",
        name: "rotate",
        stateMutability: "nonpayable",
        inputs: [
            { name: "tokenId", type: "uint256" },
            { name: "newController", type: "address" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "walletOfAgent",
        stateMutability: "view",
        inputs: [{ name: "controller", type: "address" }],
        outputs: [{ name: "tokenId", type: "uint256" }],
    },
    {
        type: "function",
        name: "ownerOf",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "owner", type: "address" }],
    },
];
const CREDENTIAL_REGISTRY_ABI = [
    {
        type: "function",
        name: "issue",
        stateMutability: "nonpayable",
        inputs: [
            { name: "issuer", type: "address" },
            { name: "subject", type: "address" },
            { name: "capabilityHash", type: "bytes32" },
            { name: "issuedAt", type: "uint64" },
            { name: "expiresAt", type: "uint64" },
            { name: "nonce", type: "uint256" },
            { name: "signature", type: "bytes" },
        ],
        outputs: [{ name: "usedNonce", type: "uint256" }],
    },
    {
        type: "function",
        name: "revoke",
        stateMutability: "nonpayable",
        inputs: [
            { name: "subject", type: "address" },
            { name: "capabilityHash", type: "bytes32" },
            { name: "nonce", type: "uint256" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "isCapable",
        stateMutability: "view",
        inputs: [
            { name: "subject", type: "address" },
            { name: "capabilityHash", type: "bytes32" },
        ],
        outputs: [{ name: "capable", type: "bool" }],
    },
    {
        type: "function",
        name: "isCapableFromIssuer",
        stateMutability: "view",
        inputs: [
            { name: "subject", type: "address" },
            { name: "capabilityHash", type: "bytes32" },
            { name: "issuer", type: "address" },
        ],
        outputs: [{ name: "capable", type: "bool" }],
    },
    {
        type: "function",
        name: "latestCredential",
        stateMutability: "view",
        inputs: [
            { name: "subject", type: "address" },
            { name: "capabilityHash", type: "bytes32" },
        ],
        outputs: [
            {
                name: "view",
                type: "tuple",
                components: [
                    { name: "issuer", type: "address" },
                    { name: "issuedAt", type: "uint64" },
                    { name: "expiresAt", type: "uint64" },
                    { name: "revoked", type: "bool" },
                    { name: "valid", type: "bool" },
                ],
            },
        ],
    },
    {
        type: "function",
        name: "issuerNonce",
        stateMutability: "view",
        inputs: [{ name: "issuer", type: "address" }],
        outputs: [{ name: "nonce", type: "uint256" }],
    },
    {
        type: "function",
        name: "hashTypedData",
        stateMutability: "view",
        inputs: [
            { name: "issuer", type: "address" },
            { name: "subject", type: "address" },
            { name: "capabilityHash", type: "bytes32" },
            { name: "issuedAt", type: "uint256" },
            { name: "expiresAt", type: "uint256" },
            { name: "nonce", type: "uint256" },
        ],
        outputs: [{ name: "digest", type: "bytes32" }],
    },
];
// ---------- Command implementations ----------
async function cmdInfo() {
    const { networkName, network, deployment } = loadConfig();
    console.log(JSON.stringify({ networkName, network, deployment }, null, 2));
}
async function cmdHash() {
    const cap = arg("capability");
    if (!cap)
        throw new Error("--capability <name> required");
    console.log(JSON.stringify({ capability: cap, keccak256: capabilityHash(cap) }, null, 2));
}
function getClients() {
    const { network, deployment } = loadConfig();
    const rpc = process.env.PHAROS_RPC_URL || network.rpcUrl;
    const publicClient = createPublicClient({ transport: http(rpc) });
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
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
async function cmdIssue() {
    const { publicClient, walletClient, account, network, deployment } = getClients();
    if (!walletClient || !account)
        throw new Error("PRIVATE_KEY not set");
    const controller = arg("controller") ? parseAddress(arg("controller")) : account.address;
    const tokenUri = arg("token-uri") ?? "";
    const fn = controller.toLowerCase() === account.address.toLowerCase() ? "mintSelf" : "mint";
    const args = fn === "mintSelf" ? [tokenUri] : [controller, tokenUri];
    const hash = await walletClient.writeContract({
        address: deployment.pharosAgentId,
        abi: PHAROS_AGENT_ID_ABI,
        functionName: fn,
        args: args,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const tokenId = (await publicClient.readContract({
        address: deployment.pharosAgentId,
        abi: PHAROS_AGENT_ID_ABI,
        functionName: "walletOfAgent",
        args: [controller],
    }));
    console.log(JSON.stringify({
        ok: true,
        action: "issue",
        controller,
        tokenId: tokenId.toString(),
        txHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        explorer: `${network.explorerUrl}tx/${hash}`,
    }, null, 2));
}
async function cmdVerify() {
    const { publicClient, network, deployment } = getClients();
    const subject = arg("subject");
    const cap = arg("capability");
    if (!subject || !cap)
        throw new Error("--subject and --capability required");
    const subjectAddr = parseAddress(subject);
    const capHash = parseCap(cap);
    const issuer = arg("issuer");
    const capable = issuer
        ? (await publicClient.readContract({
            address: deployment.credentialRegistry,
            abi: CREDENTIAL_REGISTRY_ABI,
            functionName: "isCapableFromIssuer",
            args: [subjectAddr, capHash, parseAddress(issuer)],
        }))
        : (await publicClient.readContract({
            address: deployment.credentialRegistry,
            abi: CREDENTIAL_REGISTRY_ABI,
            functionName: "isCapable",
            args: [subjectAddr, capHash],
        }));
    const view = (await publicClient.readContract({
        address: deployment.credentialRegistry,
        abi: CREDENTIAL_REGISTRY_ABI,
        functionName: "latestCredential",
        args: [subjectAddr, capHash],
    }));
    console.log(JSON.stringify({
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
    }, null, 2));
}
async function cmdRevoke() {
    const { publicClient, network, deployment, chain } = getClients();
    const subject = arg("subject");
    const cap = arg("capability");
    const nonce = arg("nonce");
    if (!subject || !cap || !nonce)
        throw new Error("--subject, --capability, --nonce required");
    const issuerKey = (arg("issuer-key") || process.env.PRIVATE_KEY);
    if (!issuerKey)
        throw new Error("--issuer-key or PRIVATE_KEY required");
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
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(JSON.stringify({
        ok: true,
        action: "revoke",
        subject: subjectAddr,
        capability: cap,
        nonce: nonceBig.toString(),
        txHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        explorer: `${network.explorerUrl}tx/${hash}`,
    }, null, 2));
}
async function cmdRotate() {
    const { publicClient, walletClient, account, network, deployment } = getClients();
    if (!walletClient || !account)
        throw new Error("PRIVATE_KEY not set");
    const tokenId = arg("token-id");
    const newController = arg("new-controller");
    if (!tokenId || !newController)
        throw new Error("--token-id and --new-controller required");
    const tokenIdBig = BigInt(tokenId);
    const newAddr = parseAddress(newController);
    const current = (await publicClient.readContract({
        address: deployment.pharosAgentId,
        abi: PHAROS_AGENT_ID_ABI,
        functionName: "ownerOf",
        args: [tokenIdBig],
    }));
    if (current.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error(`caller ${account.address} is not the current controller of tokenId ${tokenId} (current: ${current})`);
    }
    const hash = await walletClient.writeContract({
        address: deployment.pharosAgentId,
        abi: PHAROS_AGENT_ID_ABI,
        functionName: "rotate",
        args: [tokenIdBig, newAddr],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(JSON.stringify({
        ok: true,
        action: "rotate",
        tokenId: tokenIdBig.toString(),
        from: current,
        to: newAddr,
        txHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        explorer: `${network.explorerUrl}tx/${hash}`,
    }, null, 2));
}
async function cmdSign() {
    const { publicClient, network, deployment } = getClients();
    const issuerKey = arg("issuer-key");
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
    }));
    const digest = (await publicClient.readContract({
        address: deployment.credentialRegistry,
        abi: CREDENTIAL_REGISTRY_ABI,
        functionName: "hashTypedData",
        args: [issuerAccount.address, subjectAddr, capHash, issuedAt, expiresAt, nonce],
    }));
    const signature = await issuerAccount.sign({ hash: digest });
    console.log(JSON.stringify({
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
        submitCommand: `cast send ${deployment.credentialRegistry} "issue(address,address,bytes32,uint64,uint64,uint256,bytes)" ${issuerAccount.address} ${subjectAddr} ${capHash} ${issuedAt} ${expiresAt} ${nonce} ${signature} --rpc-url ${process.env.PHAROS_RPC_URL || network.rpcUrl} --private-key <SUBMITTER_KEY>`,
    }, null, 2));
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
//# sourceMappingURL=index.js.map