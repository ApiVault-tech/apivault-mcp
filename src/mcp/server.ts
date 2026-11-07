import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { ApiVaultClient, ApiVaultError } from "../lib/apivault-client";
import { MCP_VERSION } from "../lib/version";
import { getApiVaultUrl } from "../lib/config";
import { getMcpServerIcons } from "../lib/mcp-icons";

function toolError(message: string, code?: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
    ...(code ? { _meta: { code } } : {}),
  };
}

function toolJson(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

// X-Secret-Key is the documented name; Claude's connector dialog only sends
// approved header names and it is on that list. X-Vault-Key, the first name
// shipped, is still read so existing configurations keep working.
const CONNECTION_VAULT_KEY_HEADERS = ["x-secret-key", "x-vault-key"] as const;

/**
 * The vault key a user configured on the MCP connection itself, sent as an
 * `X-Secret-Key` header by their client on every request. Keeping it there
 * means the agent never sees it: tools forward it to ApiVault without the key
 * ever appearing in a tool call or the conversation.
 */
export function readConnectionVaultKey(headers: Headers): string | undefined {
  for (const name of CONNECTION_VAULT_KEY_HEADERS) {
    const value = headers.get(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

const HEADER_SETUP_HINT =
  "Ask the user to add their vault key to this MCP server's connection settings as an X-Secret-Key header, so it never passes through the chat. Do not ask them to paste it here.";

const VAULT_KEY_ARGUMENT = z
  .string()
  .optional()
  .describe(
    "Leave empty. Projects with a custom vault key should have it set as an X-Secret-Key header on this MCP connection. Only pass it if the user explicitly chose to give it here.",
  );

function mapClientError(err: unknown, connectionVaultKey?: string) {
  if (err instanceof ApiVaultError) {
    if (err.code === "VAULT_KEY_REQUIRED" && !connectionVaultKey) {
      return toolError(`${err.message} ${HEADER_SETUP_HINT}`, err.code);
    }
    if (err.code === "INVALID_VAULT_KEY" && connectionVaultKey) {
      return toolError(
        `${err.message} The vault key comes from the X-Secret-Key header in this MCP connection; ask the user to correct it in their client's settings.`,
        err.code,
      );
    }
    return toolError(err.message, err.code);
  }
  if (err instanceof Error) {
    return toolError(err.message);
  }
  return toolError("Unexpected error communicating with ApiVault.", "INTERNAL");
}

/**
 * `connectionVaultKey` is the `X-Secret-Key` header from the incoming request.
 * When present it is used for every tool and a `vault_key` argument is
 * ignored, so the key the user configured is the one that counts.
 */
export function createMcpServer(bearerToken: string, connectionVaultKey?: string): McpServer {
  const client = new ApiVaultClient(bearerToken);
  const vaultKeyFor = (argument?: string) => connectionVaultKey ?? (argument || undefined);
  const mapError = (err: unknown) => mapClientError(err, connectionVaultKey);

  const server = new McpServer(
    {
      name: "apivault",
      version: MCP_VERSION,
      title: "ApiVault",
      description: "Secure API key vault for AI agents and developers.",
      websiteUrl: getApiVaultUrl(),
      icons: getMcpServerIcons(),
    },
    {
      capabilities: { tools: {} },
      instructions:
        "ApiVault Remote MCP Server. Manage encrypted API keys and credentials. Use list_keys to browse masked keys, reveal_key to decrypt raw secret values, and add_key / update_key / delete_key for management. Projects with a custom vault key need it to reveal, add or change values. The user should set it once as an X-Secret-Key header in this server's connection settings; never ask them to type the vault key into the chat.",
    },
  );

  server.registerTool(
    "list_keys",
    {
      title: "List API Keys",
      description: "List API keys (masked preview). Optional filters by environment (e.g. Production, Staging) or service name.",
      inputSchema: {
        environment: z.string().optional().describe("Filter by environment name"),
        service: z.string().optional().describe("Filter by service name (e.g. Stripe, OpenAI, AWS)"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ environment, service }) => {
      try {
        const keys = await client.listKeys({ environment, service });
        return toolJson({ keys });
      } catch (err) {
        return mapError(err);
      }
    },
  );

  server.registerTool(
    "get_key",
    {
      title: "Get API Key Metadata",
      description: "Get metadata for a single API key by id (masked value).",
      inputSchema: {
        id: z.string().describe("The unique ID of the key to retrieve"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ id }) => {
      try {
        const key = await client.getKey(id);
        return toolJson({ key });
      } catch (err) {
        return mapError(err);
      }
    },
  );

  server.registerTool(
    "reveal_key",
    {
      title: "Reveal Secret API Key",
      description: "Decrypt and reveal the raw secret value of an API key.",
      inputSchema: {
        id: z.string().describe("The ID of the key to decrypt"),
        vault_key: VAULT_KEY_ARGUMENT,
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ id, vault_key }) => {
      try {
        const revealed = await client.revealKey(id, vaultKeyFor(vault_key));
        return toolJson(revealed);
      } catch (err) {
        return mapError(err);
      }
    },
  );

  server.registerTool(
    "add_key",
    {
      title: "Add API Key",
      description: "Store a new API key in the encrypted vault.",
      inputSchema: {
        name: z.string().describe("Key name (e.g. STRIPE_SECRET_KEY, OPENAI_API_KEY)"),
        key: z.string().describe("Raw secret API key value to encrypt and store"),
        service: z.string().optional().describe("Service name (e.g. Stripe, OpenAI, Resend, Supabase)"),
        environment: z.string().optional().describe("Environment label (defaults to Production)"),
        notes: z.string().optional().describe("Optional developer notes or description"),
        vault_key: VAULT_KEY_ARGUMENT,
      },
      annotations: {
        readOnlyHint: false,
      },
    },
    async ({ name, key, service, environment, notes, vault_key }) => {
      try {
        const created = await client.addKey(
          { name, key, service, environment, notes },
          vaultKeyFor(vault_key),
        );
        return toolJson({ key: created });
      } catch (err) {
        return mapError(err);
      }
    },
  );

  server.registerTool(
    "update_key",
    {
      title: "Update API Key",
      description: "Update an existing API key's metadata or secret value.",
      inputSchema: {
        id: z.string().describe("The ID of the key to update"),
        name: z.string().optional().describe("New key name"),
        service: z.string().optional().describe("New service name"),
        environment: z.string().optional().describe("New environment name"),
        notes: z.string().optional().describe("New notes"),
        key: z.string().optional().describe("New raw secret value (re-encrypts key)"),
        vault_key: VAULT_KEY_ARGUMENT,
      },
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
      },
    },
    async ({ id, name, service, environment, notes, key, vault_key }) => {
      try {
        const updated = await client.updateKey(
          id,
          { name, service, environment, notes, key },
          vaultKeyFor(vault_key),
        );
        return toolJson({ key: updated });
      } catch (err) {
        return mapError(err);
      }
    },
  );

  server.registerTool(
    "delete_key",
    {
      title: "Delete API Key",
      description: "Permanently delete an API key from the vault.",
      inputSchema: {
        id: z.string().describe("The ID of the key to delete"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async ({ id }) => {
      try {
        const result = await client.deleteKey(id);
        return toolJson(result);
      } catch (err) {
        return mapError(err);
      }
    },
  );

  return server;
}
