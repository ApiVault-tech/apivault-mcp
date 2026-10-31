# Security Policy

At **ApiVault**, the security and privacy of developer credentials and API keys are our top priorities.

---

## Zero-Knowledge & Architecture Guarantees

- **No Secrets on Disk**: The standalone MCP server acts purely as an in-memory transport gateway and does not store database credentials, master encryption keys, or unsealed secrets on disk.
- **Masked Previews by Default**: The `list_keys` and `get_key` tools only expose masked string previews (e.g. `sk_live_••••1234`), protecting secrets from inadvertently leaking into LLM prompt contexts.
- **Scoped OAuth 2.1**: AI agents can only access tools corresponding to granted scopes. Raw secrets require explicit `keys:reveal` authorization.
- **Constant-Time Verification**: PKCE S256 verifications use constant-time cryptographic buffer comparisons (`crypto.timingSafeEqual`) to prevent side-channel timing attacks.

---

## Supported Versions

| Version | Supported |
|---|---|
| `1.x.x` | Yes |
| `< 1.0.0` | No |

---

## Reporting a Vulnerability

If you discover a potential security vulnerability in ApiVault or the ApiVault MCP Server, please **do NOT report it via a public GitHub issue**.

Instead, please send a detailed security report to:
**support@apivault.tech** (or contact the maintainers at [ApiVault-tech](https://github.com/ApiVault-tech)).

### What to Include in Your Report:
1. A description of the vulnerability and its potential impact.
2. Step-by-step reproduction instructions or a minimal proof of concept.
3. Affected versions and environments.

### Responsible Disclosure Timeline:
- We will acknowledge receipt of your vulnerability report within **48 hours**.
- We will provide an assessment and timeline for remediation within **5 business days**.
- Once a fix is validated and deployed, we will coordinate public disclosure with you and credit your contribution.
