/**
 * Pharos Agent Identity Skill — MCP Server
 *
 * Exposes the four core Identity Skills (issue, verify, revoke, rotate) plus two
 * helpers (hash, sign) as MCP tools. Compatible with Claude Code, Codex, and any
 * MCP-aware client.
 *
 * Run with:  npx -y tsx src/mcp/server.ts
 * Or:        npm run mcp:dev
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { createPublicClient, createWalletClient, defineChain, http, } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CREDENTIAL_REGISTRY_ABI, PHAROS_AGENT_ID_ABI, capabilityHash, isHexBytes32, loadConfig, parseAddress, } from "../lib/index.js";
export { PHAROS_AGENT_ID_ABI, CREDENTIAL_REGISTRY_ABI };
// ---------- Load network + deployment config ----------
const { networkName, network, deployment } = loadConfig();
// ---------- viem clients ----------
const transport = http(network.rpcUrl, { retryCount: 3, timeout: 20_000 });
const publicClient = createPublicClient({ transport });
const chain = defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: network.nativeToken,
    rpcUrls: { default: { http: [network.rpcUrl] } },
});
const PRIVATE_KEY = (process.env.PRIVATE_KEY || "");
const account = PRIVATE_KEY ? privateKeyToAccount(PRIVATE_KEY) : null;
const walletClient = account
    ? createWalletClient({ account, transport, chain })
    : null;
// ---------- Helpers ----------
function requireWallet() {
    if (!walletClient || !account) {
        throw new Error("PRIVATE_KEY is not set. Set it in the MCP server's environment to use write operations.");
    }
    return { walletClient, account };
}
function addr(s) {
    return parseAddress(s);
}
// ---------- Tool implementations ----------
async function toolIssueId(args) {
    const { walletClient, account } = requireWallet();
    const controller = args.controller ? addr(args.controller) : account.address;
    const tokenUri = args.tokenUri ?? "";
    let hash;
    if (controller.toLowerCase() === account.address.toLowerCase()) {
        hash = await walletClient.writeContract({
            address: deployment.pharosAgentId,
            abi: PHAROS_AGENT_ID_ABI,
            functionName: "mintSelf",
            args: [tokenUri],
            chain,
        });
    }
    else {
        hash = await walletClient.writeContract({
            address: deployment.pharosAgentId,
            abi: PHAROS_AGENT_ID_ABI,
            functionName: "mint",
            args: [controller, tokenUri],
            chain,
        });
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const tokenId = (await publicClient.readContract({
        address: deployment.pharosAgentId,
        abi: PHAROS_AGENT_ID_ABI,
        functionName: "walletOfAgent",
        args: [controller],
    }));
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    ok: true,
                    action: "issue-id",
                    controller,
                    tokenId: tokenId.toString(),
                    txHash: hash,
                    blockNumber: receipt.blockNumber.toString(),
                    explorer: `${network.explorerUrl}tx/${hash}`,
                }, null, 2),
            },
        ],
    };
}
async function toolVerify(args) {
    const subject = addr(args.subject);
    const capHash = isHexBytes32(args.capability)
        ? args.capability
        : capabilityHash(args.capability);
    let capable;
    if (args.issuer) {
        const issuer = addr(args.issuer);
        capable = (await publicClient.readContract({
            address: deployment.credentialRegistry,
            abi: CREDENTIAL_REGISTRY_ABI,
            functionName: "isCapableFromIssuer",
            args: [subject, capHash, issuer],
        }));
    }
    else {
        capable = (await publicClient.readContract({
            address: deployment.credentialRegistry,
            abi: CREDENTIAL_REGISTRY_ABI,
            functionName: "isCapable",
            args: [subject, capHash],
        }));
    }
    const view = (await publicClient.readContract({
        address: deployment.credentialRegistry,
        abi: CREDENTIAL_REGISTRY_ABI,
        functionName: "latestCredential",
        args: [subject, capHash],
    }));
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    ok: true,
                    action: "verify",
                    subject,
                    capability: args.capability,
                    capabilityHash: capHash,
                    capable,
                    latest: {
                        issuer: view.issuer,
                        issuedAt: view.issuedAt.toString(),
                        expiresAt: view.expiresAt.toString(),
                        revoked: view.revoked,
                        valid: view.valid,
                    },
                    network: networkName,
                    chainId: network.chainId,
                }, null, 2),
            },
        ],
    };
}
async function toolRevoke(args) {
    const subject = addr(args.subject);
    const capHash = isHexBytes32(args.capability)
        ? args.capability
        : capabilityHash(args.capability);
    const nonce = BigInt(args.nonce);
    // The caller of revoke must be the issuer. If an issuerKey is provided, use a
    // throwaway wallet client. Otherwise use the default $PRIVATE_KEY wallet.
    let hash;
    if (args.issuerKey) {
        const issuerAccount = privateKeyToAccount(args.issuerKey);
        const issuerWallet = createWalletClient({ account: issuerAccount, transport, chain });
        hash = await issuerWallet.writeContract({
            address: deployment.credentialRegistry,
            abi: CREDENTIAL_REGISTRY_ABI,
            functionName: "revoke",
            args: [subject, capHash, nonce],
            chain,
        });
    }
    else {
        const { walletClient } = requireWallet();
        hash = await walletClient.writeContract({
            address: deployment.credentialRegistry,
            abi: CREDENTIAL_REGISTRY_ABI,
            functionName: "revoke",
            args: [subject, capHash, nonce],
            chain,
        });
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    ok: true,
                    action: "revoke",
                    subject,
                    capability: args.capability,
                    nonce: nonce.toString(),
                    txHash: hash,
                    blockNumber: receipt.blockNumber.toString(),
                    explorer: `${network.explorerUrl}tx/${hash}`,
                }, null, 2),
            },
        ],
    };
}
async function toolRotate(args) {
    const { walletClient, account } = requireWallet();
    const tokenId = BigInt(args.tokenId);
    const newController = addr(args.newController);
    // Verify the caller is the current controller before sending
    const current = (await publicClient.readContract({
        address: deployment.pharosAgentId,
        abi: PHAROS_AGENT_ID_ABI,
        functionName: "ownerOf",
        args: [tokenId],
    }));
    if (current.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error(`caller ${account.address} is not the current controller of tokenId ${tokenId} (current controller is ${current})`);
    }
    const hash = await walletClient.writeContract({
        address: deployment.pharosAgentId,
        abi: PHAROS_AGENT_ID_ABI,
        functionName: "rotate",
        args: [tokenId, newController],
        chain,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    ok: true,
                    action: "rotate",
                    tokenId: tokenId.toString(),
                    from: current,
                    to: newController,
                    txHash: hash,
                    blockNumber: receipt.blockNumber.toString(),
                    explorer: `${network.explorerUrl}tx/${hash}`,
                }, null, 2),
            },
        ],
    };
}
async function toolHash(args) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    ok: true,
                    action: "hash",
                    input: args.capability,
                    keccak256: capabilityHash(args.capability),
                }, null, 2),
            },
        ],
    };
}
async function toolSignCredential(args) {
    const issuerAccount = privateKeyToAccount(args.issuerKey);
    const issuer = issuerAccount.address;
    const subject = addr(args.subject);
    const capHash = isHexBytes32(args.capability)
        ? args.capability
        : capabilityHash(args.capability);
    const issuedAt = BigInt(Math.floor(Date.now() / 1000));
    const expiresAt = issuedAt + BigInt(args.expiresInSeconds ?? 2_592_000); // 30 days default
    const nonce = (await publicClient.readContract({
        address: deployment.credentialRegistry,
        abi: CREDENTIAL_REGISTRY_ABI,
        functionName: "issuerNonce",
        args: [issuer],
    }));
    const digest = (await publicClient.readContract({
        address: deployment.credentialRegistry,
        abi: CREDENTIAL_REGISTRY_ABI,
        functionName: "hashTypedData",
        args: [issuer, subject, capHash, issuedAt, expiresAt, nonce],
    }));
    const signature = await issuerAccount.sign({ hash: digest });
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    ok: true,
                    action: "sign-credential",
                    issuer,
                    subject,
                    capability: args.capability,
                    capabilityHash: capHash,
                    issuedAt: issuedAt.toString(),
                    expiresAt: expiresAt.toString(),
                    nonce: nonce.toString(),
                    digest,
                    signature,
                    nextStep: `Submit via: cast send ${deployment.credentialRegistry} "issue(address,address,bytes32,uint64,uint64,uint256,bytes)" ${issuer} ${subject} ${capHash} ${issuedAt} ${expiresAt} ${nonce} ${signature} --rpc-url ${network.rpcUrl} --private-key <SUBMITTER_KEY>`,
                }, null, 2),
            },
        ],
    };
}
// ---------- MCP server bootstrap ----------
const server = new Server({ name: "pharos-agent-identity", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "pharos-agent-identity-issue-id",
            description: "Mint a portable Agent ID NFT (PharosAgentID) for a controller wallet. Returns the new tokenId. Requires PRIVATE_KEY in env. Use this first to give an agent an on-chain identity before issuing or verifying credentials.",
            inputSchema: {
                type: "object",
                properties: {
                    tokenUri: {
                        type: "string",
                        description: "Optional metadata URI (IPFS CID, HTTPS URL, or empty). Stored on-chain as the token's metadata pointer.",
                    },
                    controller: {
                        type: "string",
                        description: "Optional controller address. If omitted, the caller's wallet becomes the controller.",
                    },
                },
            },
        },
        {
            name: "pharos-agent-identity-verify",
            description: "Read-only. Returns whether a subject wallet currently holds a valid (non-revoked, non-expired) credential for a given capability. Optionally scoped to a specific issuer. Does NOT require PRIVATE_KEY.",
            inputSchema: {
                type: "object",
                properties: {
                    subject: {
                        type: "string",
                        description: "The agent's controller wallet (0x...)",
                    },
                    capability: {
                        type: "string",
                        description: "Either a human-readable name (e.g. 'agent.commerce.escrow') or a 0x...bytes32 hash. Human names are keccak256-hashed internally.",
                    },
                    issuer: {
                        type: "string",
                        description: "Optional. If provided, only credentials from this issuer are considered.",
                    },
                },
                required: ["subject", "capability"],
            },
        },
        {
            name: "pharos-agent-identity-revoke",
            description: "Revoke a previously-issued credential. Only the original issuer can revoke. Revocation is permanent. By default uses the caller's $PRIVATE_KEY wallet; pass issuerKey to use a different issuer's key.",
            inputSchema: {
                type: "object",
                properties: {
                    subject: {
                        type: "string",
                        description: "The agent's controller wallet (0x...)",
                    },
                    capability: {
                        type: "string",
                        description: "Either a human-readable name (e.g. 'agent.commerce.escrow') or a 0x...bytes32 hash.",
                    },
                    nonce: {
                        type: "string",
                        description: "The credential nonce returned at issue time",
                    },
                    issuerKey: {
                        type: "string",
                        description: "Optional. Issuer's private key. If provided, used to sign the revoke tx. If omitted, the caller's $PRIVATE_KEY is used.",
                    },
                },
                required: ["subject", "capability", "nonce"],
            },
        },
        {
            name: "pharos-agent-identity-rotate",
            description: "Rotate the controller key of an existing Agent ID. The caller must be the current controller. The ID NFT moves to the new controller; credentials issued under the old controller address do NOT follow (re-issue them on the new controller).",
            inputSchema: {
                type: "object",
                properties: {
                    tokenId: {
                        type: "string",
                        description: "The Agent ID tokenId to rotate",
                    },
                    newController: {
                        type: "string",
                        description: "The new controller wallet (0x...)",
                    },
                },
                required: ["tokenId", "newController"],
            },
        },
        {
            name: "pharos-agent-identity-hash",
            description: "Compute the keccak256 hash of a capability name. Returns a 0x...bytes32. Use this to get a hash without deploying, or to verify that off-chain and on-chain names match.",
            inputSchema: {
                type: "object",
                properties: {
                    capability: {
                        type: "string",
                        description: "Human-readable capability name (e.g. 'agent.commerce.escrow')",
                    },
                },
                required: ["capability"],
            },
        },
        {
            name: "pharos-agent-identity-sign-credential",
            description: "Build and sign an EIP-712 credential attestation off-chain. Returns the digest, signature, and the exact `cast send` command to submit it. Use this on the issuer side; the resulting signature can be submitted by anyone.",
            inputSchema: {
                type: "object",
                properties: {
                    issuerKey: {
                        type: "string",
                        description: "Issuer's private key (0x...)",
                    },
                    subject: {
                        type: "string",
                        description: "The agent's controller wallet (0x...)",
                    },
                    capability: {
                        type: "string",
                        description: "Either a human-readable name (e.g. 'agent.commerce.escrow') or a 0x...bytes32 hash.",
                    },
                    expiresInSeconds: {
                        type: "number",
                        description: "Optional. Seconds from now until expiry. Default 2,592,000 (30 days).",
                    },
                },
                required: ["issuerKey", "subject", "capability"],
            },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "pharos-agent-identity-issue-id":
                return await toolIssueId(args);
            case "pharos-agent-identity-verify":
                return await toolVerify(args);
            case "pharos-agent-identity-revoke":
                return await toolRevoke(args);
            case "pharos-agent-identity-rotate":
                return await toolRotate(args);
            case "pharos-agent-identity-hash":
                return await toolHash(args);
            case "pharos-agent-identity-sign-credential":
                return await toolSignCredential(args);
            default:
                return {
                    content: [{ type: "text", text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ ok: false, error: message, tool: name }, null, 2),
                },
            ],
            isError: true,
        };
    }
});
const transport_ = new StdioServerTransport();
await server.connect(transport_);
console.error(`pharos-agent-identity MCP server running on stdio (network: ${networkName})`);
//# sourceMappingURL=server.js.map