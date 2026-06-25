/**
 * Chain network metadata for client-safe components.
 *
 * The web/ app today reads Pharos Atlantic live; the Casper entry is shown
 * in the UI but its on-chain reads are gated on the Casper contracts being
 * deployed. See `docs/casper-buildathon.md` for the rollout plan.
 */

export interface ChainNetwork {
  id: string;
  kind: "evm" | "casper";
  name: string;
  chainId?: number;
  chainName?: string;
  explorerUrl: string;
  /** True if the web/ app talks to this chain live today. */
  live: boolean;
}

export const PHAROS_ATLANTIC: ChainNetwork = {
  id: "pharos-atlantic",
  kind: "evm",
  name: "Pharos Atlantic Testnet",
  chainId: 688689,
  explorerUrl: "https://atlantic.pharosscan.xyz",
  live: true,
};

export const CASPER_TESTNET: ChainNetwork = {
  id: "casper-testnet",
  kind: "casper",
  name: "Casper Testnet",
  chainName: "casper-test",
  explorerUrl: "https://testnet.cspr.live",
  live: false, // flips to true once Odra contracts deploy + LIGIS_CASPER_* env is set
};

export const CHAINS: ChainNetwork[] = [PHAROS_ATLANTIC, CASPER_TESTNET];

/** Legacy export — kept so existing components don't break. */
export const network = PHAROS_ATLANTIC;
