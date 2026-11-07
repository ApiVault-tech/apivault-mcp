# ApiVault Remote MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Protocol: MCP](https://img.shields.io/badge/Protocol-Model%20Context%20Protocol-green.svg)](https://modelcontextprotocol.io)
[![Transport: Streamable HTTP](https://img.shields.io/badge/Transport-Streamable%20HTTP-purple.svg)](https://modelcontextprotocol.io/docs/concepts/transports)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.12.0-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.3-black.svg)](https://nextjs.org/)
[![OAuth 2.1](https://img.shields.io/badge/Auth-OAuth%202.1%20%2B%20PKCE-orange.svg)](https://oauth.net/2.1/)

**Secure, encrypted API key management for AI coding agents.**  
*Official remote Model Context Protocol (MCP) server for [ApiVault](https://apivault.tech).*

[Quick Start](#quick-start) • [Tools Reference](#tools-reference) • [Architecture](#architecture) • [OAuth 2.1 & Scopes](#oauth-21--scopes) • [Error Codes & Troubleshooting](#error-codes--troubleshooting) • [Self-Hosting & Development](#self-hosting--development)

---

## Overview

The **ApiVault Remote MCP Server** allows AI assistants (such as **Cursor**, **Claude Desktop**, **Windsurf**, and **Claude Code**) to interact with your encrypted secrets in **[ApiVault](https://apivault.tech)** safely and auditably.

Instead of pasting raw API keys into chat prompts or committing `.env` files to git, AI agents can:
1. Search and inspect available credentials using **masked previews** (e.g. `sk_live_••••1234`).
2. Request raw secret values only when executing code via scoped permissions.
3. Automatically store newly generated API keys directly into your vault.
4. Support **custom vault keys**, sent with each request that needs them and used in memory to decrypt.

---

## 🤖 Official AI Agent Skill

If you use AI coding assistants (**Cursor**, **Claude Code**, **Windsurf**, or **Google Antigravity**), install the official [ApiVault Agent Skill](https://github.com/ApiVault-tech/apivault-skill) into your workspace:

```bash
git clone https://github.com/ApiVault-tech/apivault-skill.git .agents/skills/apivault
```

This equips your AI agents with native runbooks, copy-paste prompt templates, and security guidelines for interacting with ApiVault MCP.

---

## Quick Start

### 1. Cursor
Open Cursor Settings (`Cmd/Ctrl + Shift + J`) → **MCP** → **Add New MCP Server**, or add to your `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "apivault": {
      "url": "https://mcp.apivault.tech/mcp"
    }
  }
}
```

---

### 2. Claude Desktop & Claude.ai
- **Method 1 (UI Connector):** In Claude Desktop / Claude.ai, navigate to **Settings → Connectors → Add Custom Connector**, enter Name: `ApiVault` and Remote URL: `https://mcp.apivault.tech/mcp`.
- **Method 2 (Config File):** Add to your Claude Desktop configuration file:
  - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
  - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
  - **Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "apivault": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.apivault.tech/mcp"]
    }
  }
}
```

---

### 3. Windsurf
Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "apivault": {
      "url": "https://mcp.apivault.tech/mcp"
    }
  }
}
```

---

### 4. Claude Code (CLI)
Run in your terminal:

```bash
claude mcp add apivault https://mcp.apivault.tech/mcp
```

---

### 5. VS Code (Cline / Roo Code / Continue)
In your extension's MCP Settings JSON:

```json
{
  "mcpServers": {
    "apivault": {
      "url": "https://mcp.apivault.tech/mcp",
      "transport": "http"
    }
  }
}
```

> **First Connection:** When your agent first initializes, a browser tab opens to the main ApiVault website (`https://apivault.tech`) to authenticate your account and approve the requested scopes.

---

### Projects with a custom vault key

Set the vault key once as an `X-Secret-Key` header on the server entry. Your client sends it with every request and the server uses it for `reveal_key`, `add_key` and `update_key`, so you never type the vault key into the chat and the AI never sees it. Read it from an environment variable or a prompt rather than writing it into the file:

```jsonc
// Cursor (.cursor/mcp.json)
{ "mcpServers": { "apivault": { "url": "https://mcp.apivault.tech/mcp", "headers": { "X-Secret-Key": "${env:APIVAULT_KEY}" } } } }

// Claude Code (.mcp.json)
{ "mcpServers": { "apivault": { "type": "http", "url": "https://mcp.apivault.tech/mcp", "headers": { "X-Secret-Key": "${APIVAULT_KEY}" } } } }

// VS Code (.vscode/mcp.json): prompts once and stores it as a secret
{
  "inputs": [{ "type": "promptString", "id": "apivault-vault-key", "description": "ApiVault vault key", "password": true }],
  "servers": { "apivault": { "type": "http", "url": "https://mcp.apivault.tech/mcp", "headers": { "X-Secret-Key": "${input:apivault-vault-key}" } } }
}
```

When the header is set, a `vault_key` tool argument is ignored. In Claude.ai and Claude for Desktop, add a request header named `x-secret-key` when you add the custom connector (request headers are in beta for some organizations). Clients that can't add headers to a remote server (such as ChatGPT) can still pass `vault_key`, but that puts the key in the conversation history.

---

## Tools Reference

The server exposes 6 tools adhering to the Model Context Protocol:

### 1. `list_keys`
List stored API keys with masked values (e.g. `sk_live_••••1234`). Prevents prompt pollution while allowing the agent to discover available services.
- **Required Scope:** `keys:read`
- **Parameters:**
  - `environment` *(string, optional)*: Filter by environment (e.g. `Production`, `Staging`, `Development`).
  - `service` *(string, optional)*: Filter by service name (e.g. `Stripe`, `OpenAI`, `Resend`).
- **Example Agent Prompt:**
  > "What Stripe credentials do we have stored in Production?"

---

### 2. `get_key`
Retrieve metadata and masked preview for a specific credential by ID.
- **Required Scope:** `keys:read`
- **Parameters:**
  - `id` *(string, required)*: The unique ID of the key.
- **Example Agent Prompt:**
  > "Check the metadata and last updated date for key 'cm123abc'."

---

### 3. `reveal_key`
Decrypt and return the raw, unmasked API key value.
- **Required Scope:** `keys:reveal`
- **Parameters:**
  - `id` *(string, required)*: The ID of the key to decrypt.
  - `vault_key` *(string, optional)*: Fallback for clients without header support. Prefer the `X-Secret-Key` connection header; when it is set, this argument is ignored.
- **Example Agent Prompt:**
  > "I need the raw OpenAI API key so I can run the backend integration tests."

---

### 4. `add_key`
Securely encrypt and store a new API key in the vault.
- **Required Scope:** `keys:write`
- **Parameters:**
  - `name` *(string, required)*: Key identifier (e.g. `STRIPE_SECRET_KEY`, `RESEND_API_KEY`).
  - `key` *(string, required)*: Raw secret value to encrypt.
  - `service` *(string, optional)*: Service name (e.g. `Stripe`, `OpenAI`, `AWS`).
  - `environment` *(string, optional)*: Target environment (defaults to `Production`).
  - `notes` *(string, optional)*: Developer documentation or usage notes.
  - `vault_key` *(string, optional)*: Fallback for clients without header support; ignored when the `X-Secret-Key` header is set.
- **Example Agent Prompt:**
  > "Store this newly generated Supabase service role key in our Production vault."

---

### 5. `update_key`
Update an existing key's metadata or re-encrypt its secret value.
- **Required Scope:** `keys:write`
- **Parameters:**
  - `id` *(string, required)*: Key ID to update.
  - `name`, `service`, `environment`, `notes` *(string, optional)*: Metadata updates.
  - `key` *(string, optional)*: New raw secret value (triggers re-encryption).
  - `vault_key` *(string, optional)*: Fallback for clients without header support; ignored when the `X-Secret-Key` header is set.
- **Example Agent Prompt:**
  > "Update the notes on the Resend API key to 'Rotated on August 18'."

---

### 6. `delete_key`
Permanently remove an API key from the vault.
- **Required Scope:** `keys:write`
- **Parameters:**
  - `id` *(string, required)*: Key ID to delete.
- **Example Agent Prompt:**
  > "Delete the deprecated staging database credential."

---

## Architecture

The MCP server uses a **Stateless Protocol Gateway** architecture, separating the public transport layer from the database and cryptographic storage:

```
+----------------------------------------------------------+
|  AI Agent (Cursor / Claude Desktop / Windsurf)           |
+----------------------------+-----------------------------+
                             | Streamable HTTP (JSON-RPC)
                             v
+----------------------------------------------------------+
|  ApiVault MCP Server (mcp.apivault.tech)                 |
|  - RFC 9728 Protected Resource Metadata (PRM)           |
|  - Streamable HTTP Transport (/mcp)                      |
|  - Zero Database Credentials / Zero Stored Keys          |
+----------------------------+-----------------------------+
                             | Scoped HTTPS REST Gateway (Bearer Token)
                             v
+----------------------------------------------------------+
|  ApiVault Backend (apivault.tech)                        |
|  - OAuth 2.1 Authorization Server (DCR + PKCE S256)      |
|  - Browser Consent UI (/mcp/authorize)                   |
|  - Cryptographic Key Decryption & MySQL Vault            |
+----------------------------------------------------------+
```

### Security Properties:
1. **Zero Database Passwords**: The public `apivault-mcp` service holds no MySQL credentials and no master encryption keys.
2. **Stateless Forwarding**: Client requests are verified and forwarded to ApiVault's scoped gateway (`/api/mcp/v1/keys`) using standard OAuth Bearer tokens.
3. **Vault Keys Per Request**: A custom vault key, from the connection's `X-Secret-Key` header or a `vault_key` argument, is forwarded to ApiVault in the `x-vault-key` header for that single request. This service and ApiVault's gateway do not store it or write it to their application logs. A key set as a connection header never reaches the AI; one passed as a tool argument may be kept in your client's conversation history.

---

## OAuth 2.1 & Scopes

The MCP server implements standard OAuth 2.1 with **Dynamic Client Registration (RFC 7591)** and **PKCE S256 (RFC 7636)**:

| Scope | Name | Grants Access To |
|---|---|---|
| `keys:read` | Read Metadata | `list_keys`, `get_key` (masked previews only) |
| `keys:write` | Manage Keys | `add_key`, `update_key`, `delete_key` |
| `keys:reveal` | Decrypt Secrets | `reveal_key` (access raw unmasked secret values) |

### Project-Scoped Connections

ApiVault workspaces are multi-project. During the browser consent step the user picks a **target project** alongside the scopes, and the issued token is permanently bound to it. Every tool call routes to that project automatically — agents never pass a project ID in tool arguments. To work against a different project, connect the server again and approve a new authorization for it.

### Managing & Revoking Connections
Users can review connected AI agents, inspect granted scopes, and revoke access at any time in the web dashboard:
[ApiVault Dashboard → Settings → MCP Connections](https://apivault.tech/settings/mcp)

---

## Error Codes & Troubleshooting

| Error Code | Reason | Resolution |
|---|---|---|
| `UNAUTHORIZED` | Expired or missing OAuth Bearer token. | Re-authenticate in Cursor or Claude Desktop via the Reconnect action. |
| `INSUFFICIENT_SCOPE` | Token lacks the required scope (e.g. tried `reveal_key` with only `keys:read`). | Re-authenticate and grant the `keys:reveal` or `keys:write` scope during browser consent. |
| `VAULT_KEY_REQUIRED` | The project uses custom encryption mode and no vault key was configured. | Add the vault key as an `X-Secret-Key` header on the MCP connection (see [Projects with a custom vault key](#projects-with-a-custom-vault-key)). |
| `INVALID_VAULT_KEY` | The supplied custom vault key failed decryption check. | Correct the `X-Secret-Key` header in the client settings. Do not re-send the same key — wrong guesses are counted against the limit below. |
| `VAULT_KEY_RATE_LIMITED` | Too many incorrect vault keys — 10 per 15 minutes, counted per user and per source address. | **Stop retrying.** The tool error states how long to wait (from the `Retry-After` header); ask the user for the correct vault key rather than guessing again. |
| `RATE_LIMITED` | The backend throttled the request (HTTP `429`) without a specific code. | Wait for the delay named in the error message before retrying. |
| `DUPLICATE_KEY` | A key with the same name and environment already exists. | Use `update_key` or pick a unique key name. |
| `NOT_FOUND` | The specified key ID does not exist in your vault. | Use `list_keys` to verify the active key IDs. |
| `NETWORK_ERROR` | Unable to reach the ApiVault backend gateway. | Check internet connectivity and verify `API_VAULT_URL`. |

> **Vault key attempt limits:** a custom-mode vault key is checked against a stored hash, so every surface that accepts one — web, CLI, and MCP — shares one server-side attempt budget. Only calls that actually carry a `vault_key` are counted and a correct key clears the counter, so revealing many keys in a row is fine; repeatedly submitting an unconfirmed key locks the vault path for the user.

---

## Self-Hosting & Development

You can run your own standalone MCP server or deploy it to your private cloud infrastructure:

### Prerequisites
- Node.js >= 20.12.0
- npm or pnpm

### 1. Clone and Install
```bash
git clone https://github.com/ApiVault-tech/apivault-mcp.git
cd apivault-mcp
npm install
```

### 2. Configure Environment
Create `.env.local`:

```env
# ApiVault Backend URL
API_VAULT_URL=https://apivault.tech

# Public URL of this MCP server
MCP_SERVER_URL=http://localhost:3001

# MCP Session TTL in minutes (default: 60). Increase to reduce
# "session not found" errors on serverless platforms with cold starts.
# MCP_SESSION_TTL_MINUTES=60
```

### 3. Run Development Server
```bash
npm run dev
# Server running at http://localhost:3001
```

### 4. Run Test Suite
```bash
npm test
```

### 5. Build for Production
```bash
npm run build
npm start
```

---

## Community & Ecosystem

- **Main Platform:** [ApiVault Web Dashboard](https://apivault.tech)
- **AI Agent Skill:** [apivault-skill (GitHub)](https://github.com/ApiVault-tech/apivault-skill)
- **CLI Tool:** [apivault-cli (npm)](https://www.npmjs.com/package/apivault)
- **Documentation:** [ApiVault Docs & Guides](https://apivault.tech/docs)
- **Bug Reports & Issues:** [GitHub Issues](https://github.com/ApiVault-tech/apivault-mcp/issues)

---

## License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

Copyright (c) 2026 TLB STATION • [ApiVault](https://apivault.tech)
