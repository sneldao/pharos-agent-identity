// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CredentialRegistry
/// @notice EIP-712 verifiable credential registry for the Pharos Identity Skill. An authorized
///         `issuer` (e.g. a KYC provider, a DAO, a marketplace) signs an attestation stating that
///         `subject` (an agent's controller wallet) holds a given `capability`. Other Skills (Aegis,
///         FaroLink, Maestro, etc.) gate access by calling `isCapable`.
///
///         Each `(subject, capabilityHash, issuer, nonce)` is a single credential. The latest
///         non-revoked, non-expired credential from a given issuer wins. Issuers can revoke their
///         own credentials at any time. The contract is non-custodial: it never holds funds.
contract CredentialRegistry {
    struct Credential {
        address issuer;
        address subject;
        bytes32 capabilityHash;
        uint64 issuedAt;
        uint64 expiresAt;
        uint64 revokedAt; // 0 == not revoked
        uint64 nonce;
    }

    struct CredentialView {
        address issuer;
        uint64 issuedAt;
        uint64 expiresAt;
        bool revoked;
        bool valid;
    }

    bytes32 private constant CREDENTIAL_TYPEHASH = keccak256(
        "Credential(address issuer,address subject,bytes32 capabilityHash,uint256 issuedAt,uint256 expiresAt,uint256 nonce)"
    );

    // issuer => nonce (each issuer keeps its own counter; this is the nonce the issuer must include)
    mapping(address => uint256) public issuerNonce;

    // subject => capabilityHash => credentialNonce => Credential
    mapping(address => mapping(bytes32 => mapping(uint256 => Credential))) private _credentials;

    // existence flag: at least one non-revoked, non-expired credential exists for (subject, cap).
    // We need this separate from `_latestValidNonce` because a credential issued with nonce 0 is
    // indistinguishable from "no credential" if we only check the nonce value.
    mapping(address => mapping(bytes32 => bool)) private _hasValid;

    // quick existence flags so verify() doesn't have to iterate
    mapping(address => mapping(bytes32 => uint256)) private _latestNonce; // newest issued
    mapping(address => mapping(bytes32 => uint256)) private _latestValidNonce; // newest not revoked & not expired

    event CredentialIssued(
        address indexed issuer,
        address indexed subject,
        bytes32 indexed capabilityHash,
        uint256 nonce,
        uint64 issuedAt,
        uint64 expiresAt
    );
    event CredentialRevoked(
        address indexed issuer,
        address indexed subject,
        bytes32 indexed capabilityHash,
        uint256 nonce,
        uint64 revokedAt
    );

    error Expired(uint64 expiresAt, uint64 nowTs);
    error NotIssuer(address caller, address issuer);
    error InvalidSignature();
    error InvalidExpiry();
    error ZeroAddress();
    error AlreadyRevoked();
    error UnknownCredential();

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("PharosAgentCredential")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice Issue a credential. Caller submits a signed EIP-712 attestation from `issuer`. The
    ///         `nonce` must equal the issuer's current `issuerNonce` to prevent replay across
    ///         contexts. Anyone may submit the signed attestation (it's public), but only the
    ///         issuer can sign it. Auto-increments `issuerNonce[issuer]`.
    function issue(
        address issuer,
        address subject,
        bytes32 capabilityHash,
        uint64 issuedAt,
        uint64 expiresAt,
        uint256 nonce,
        bytes calldata signature
    ) external returns (uint256 usedNonce) {
        if (issuer == address(0) || subject == address(0)) revert ZeroAddress();
        if (expiresAt <= issuedAt) revert InvalidExpiry();
        if (block.timestamp > expiresAt) revert Expired(expiresAt, uint64(block.timestamp));
        if (nonce != issuerNonce[issuer]) revert InvalidSignature();

        bytes32 structHash = keccak256(
            abi.encode(CREDENTIAL_TYPEHASH, issuer, subject, capabilityHash, issuedAt, expiresAt, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));

        address recovered = _recover(digest, signature);
        if (recovered != issuer) revert InvalidSignature();

        _credentials[subject][capabilityHash][nonce] = Credential({
            issuer: issuer,
            subject: subject,
            capabilityHash: capabilityHash,
            issuedAt: issuedAt,
            expiresAt: expiresAt,
            revokedAt: 0,
            nonce: uint64(nonce)
        });

        if (nonce > _latestNonce[subject][capabilityHash]) {
            _latestNonce[subject][capabilityHash] = nonce;
        }
        // The new credential is valid (just issued, not revoked, not expired). Track it.
        _latestValidNonce[subject][capabilityHash] = nonce;
        _hasValid[subject][capabilityHash] = true;

        issuerNonce[issuer] = nonce + 1;

        emit CredentialIssued(issuer, subject, capabilityHash, nonce, issuedAt, expiresAt);
        return nonce;
    }

    /// @notice Revoke a previously-issued credential. Only the original issuer may revoke.
    ///         Revocation is permanent and the credential is no longer valid.
    function revoke(address subject, bytes32 capabilityHash, uint256 nonce) external {
        Credential storage cred = _credentials[subject][capabilityHash][nonce];
        if (cred.issuer == address(0)) revert UnknownCredential();
        if (msg.sender != cred.issuer) revert NotIssuer(msg.sender, cred.issuer);
        if (cred.revokedAt != 0) revert AlreadyRevoked();

        cred.revokedAt = uint64(block.timestamp);

        // If this was the "latest valid" entry, recompute by scanning recent nonces.
        if (_latestValidNonce[subject][capabilityHash] == nonce) {
            _hasValid[subject][capabilityHash] = false;
            _latestValidNonce[subject][capabilityHash] = 0;
            uint256 top = _latestNonce[subject][capabilityHash];
            for (uint256 i = top; i > 0; i--) {
                Credential storage c = _credentials[subject][capabilityHash][i];
                if (c.issuer == address(0)) continue;
                if (c.revokedAt != 0) continue;
                if (block.timestamp > c.expiresAt) continue;
                _hasValid[subject][capabilityHash] = true;
                _latestValidNonce[subject][capabilityHash] = i;
                break;
            }
        }

        emit CredentialRevoked(cred.issuer, subject, capabilityHash, nonce, cred.revokedAt);
    }

    // ---------- Read API used by other Skills (Aegis, FaroLink, ...) ----------

    /// @notice Returns true if the subject currently holds a valid (non-revoked, non-expired)
    ///         credential for the given capability from any issuer.
    function isCapable(address subject, bytes32 capabilityHash) external view returns (bool) {
        if (!_hasValid[subject][capabilityHash]) return false;
        uint256 nonce = _latestValidNonce[subject][capabilityHash];
        Credential storage c = _credentials[subject][capabilityHash][nonce];
        if (c.issuer == address(0)) return false;
        if (c.revokedAt != 0) return false;
        if (block.timestamp > c.expiresAt) return false;
        return true;
    }

    /// @notice Returns true if a specific issuer has a valid credential for subject + capability.
    ///         Useful for Skills that only accept credentials from a known issuer (e.g. a DAO,
    ///         a KYC provider, a marketplace operator).
    function isCapableFromIssuer(
        address subject,
        bytes32 capabilityHash,
        address issuer
    ) external view returns (bool) {
        // Iterate from the latest issued nonce down to 0, inclusive. Credentials can exist at
        // any nonce including 0, so we cannot use a strict "i > 0" bound.
        uint256 top = _latestNonce[subject][capabilityHash];
        for (uint256 i = top;; i--) {
            Credential storage c = _credentials[subject][capabilityHash][i];
            if (
                c.issuer != address(0) &&
                c.issuer == issuer &&
                c.revokedAt == 0 &&
                block.timestamp <= c.expiresAt
            ) {
                return true;
            }
            if (i == 0) break;
        }
        return false;
    }

    /// @notice Read the latest credential view for a (subject, capability) pair, regardless of
    ///         validity. Used by UIs and Agents that want to surface status.
    function latestCredential(address subject, bytes32 capabilityHash) external view returns (CredentialView memory) {
        uint256 top = _latestNonce[subject][capabilityHash];
        for (uint256 i = top;; i--) {
            Credential storage c = _credentials[subject][capabilityHash][i];
            if (c.issuer != address(0)) {
                bool valid = _hasValid[subject][capabilityHash] && _latestValidNonce[subject][capabilityHash] == i;
                // _hasValid may be true but pointing at a different (older) nonce if the latest
                // was revoked; recompute the validity inline for the latest issued.
                if (valid || (c.revokedAt == 0 && block.timestamp <= c.expiresAt)) {
                    return CredentialView(c.issuer, c.issuedAt, c.expiresAt, c.revokedAt != 0, true);
                }
                return CredentialView(c.issuer, c.issuedAt, c.expiresAt, c.revokedAt != 0, false);
            }
            if (i == 0) break;
        }
        return CredentialView(address(0), 0, 0, false, false);
    }

    function getCredential(
        address subject,
        bytes32 capabilityHash,
        uint256 nonce
    ) external view returns (CredentialView memory) {
        // Iterate from `nonce` down to 0, inclusive, until we find a populated credential slot.
        // This makes the function work for any nonce value, including 0.
        for (uint256 i = nonce;; i--) {
            Credential storage c = _credentials[subject][capabilityHash][i];
            if (c.issuer != address(0)) {
                bool valid = c.revokedAt == 0 && block.timestamp <= c.expiresAt;
                return CredentialView(c.issuer, c.issuedAt, c.expiresAt, c.revokedAt != 0, valid);
            }
            if (i == 0) break;
        }
        return CredentialView(address(0), 0, 0, false, false);
    }

    // ---------- EIP-712 helpers ----------

    function hashTypedData(
        address issuer,
        address subject,
        bytes32 capabilityHash,
        uint256 issuedAt,
        uint256 expiresAt,
        uint256 nonce
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(CREDENTIAL_TYPEHASH, issuer, subject, capabilityHash, issuedAt, expiresAt, nonce)
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length == 65) {
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := calldataload(signature.offset)
                s := calldataload(add(signature.offset, 32))
                v := byte(0, calldataload(add(signature.offset, 64)))
            }
            if (v < 27) v += 27;
            return ecrecover(digest, v, r, s);
        }
        revert InvalidSignature();
    }
}
