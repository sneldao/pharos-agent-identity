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
import { CREDENTIAL_REGISTRY_ABI, PHAROS_AGENT_ID_ABI } from "../lib/index.js";
export { PHAROS_AGENT_ID_ABI, CREDENTIAL_REGISTRY_ABI };
