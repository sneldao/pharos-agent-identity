export interface Reasoner {
    reason(prompt: string): Promise<ReasoningResult>;
}
export interface ReasoningResult {
    text: string;
    verified: boolean;
    model: string;
    provider: string;
}
export interface ZeroGConfig {
    rpcUrl: string;
    privateKey: string;
    provider: string;
}
export declare function loadZeroGConfig(): ZeroGConfig;
export declare class ZeroGCompute implements Reasoner {
    private config;
    private broker;
    private metadata;
    constructor(config: ZeroGConfig);
    /** Lazily create the broker (cached for the lifetime of the instance). */
    private getBroker;
    /** Lazily fetch + cache service metadata (endpoint, model). */
    private getMetadata;
    reason(prompt: string): Promise<ReasoningResult>;
}
/**
 * Initialize a fresh 0G wallet for inference: create a ledger, acknowledge the
 * provider, and transfer funds. Run once per wallet/provider pair.
 *
 * Requires the wallet to hold enough OG for the ledger deposit + provider
 * funding + gas. Defaults to 0.5 OG ledger + 0.1 OG transfer (minimal setup).
 */
export declare function setupProvider(config: ZeroGConfig): Promise<void>;
