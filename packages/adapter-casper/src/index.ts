/**
 * @ligis/adapter-casper — ChainAdapter implementation for Casper Network.
 *
 * Status: scaffolded. CasperAdapter satisfies the ChainAdapter contract; the
 * concrete operation bodies are stubs pending the Odra contracts in
 * packages/contracts-casper being deployed and their package hashes wired
 * into env (LIGIS_CASPER_CREDENTIAL_REGISTRY, LIGIS_CASPER_AGENT_ID).
 */
export * from "./adapter.js";
export { CasperAdapter as default } from "./adapter.js";

export {
  loadCasperConfig,
  type CasperConfig,
  type CasperNetwork,
  type CasperDeployment,
} from "./config.js";

export {
  buildCasperClient,
  type CasperClientContext,
} from "./client.js";
