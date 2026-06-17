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
export {};
