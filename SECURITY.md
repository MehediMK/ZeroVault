
# Security Policy

## Reporting a vulnerability
If you discover a security issue, please open a GitHub Security Advisory or create a private report (if enabled).

## Threat model (summary)
ZeroVault is designed to protect secrets:
- at rest (encrypted JSON file)
- during transport (file stays with user)

ZeroVault does NOT protect against:
- malware on the user’s machine
- a compromised browser or extensions
- XSS due to unsafe modifications or third-party scripts

## Security design rules
- No network calls for vault data
- No persistence in localStorage/IndexedDB/cookies
- AES-GCM authenticated encryption
- Master password never stored
- Minimal metadata outside encryption
 