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

function mapClientError(err: unknown) {
  if (err instanceof ApiVaultError) {
    return toolError(err.message, err.code);
  }
  if (err instanceof Error) {
    return toolError(err.message);
  }
  return toolError("Unexpected error communicating with ApiVault.", "INTERNAL");
}

export function createMcpServer(bearerToken: string): McpServer {
  const client = new ApiVaultClient(bearerToken);

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
        "ApiVault Remote MCP Server. Manage encrypted API keys and credentials. Use list_keys to browse masked keys, reveal_key to decrypt raw secret values, and add_key / update_key / delete_key for management. Custom-mode vaults require vault_key when adding, updating, or revealing keys.",
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
        return mapClientError(err);
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
        return mapClientError(err);
      }
    },
  );

  server.registerTool(
    "reveal_key",
    {
      title: "Reveal Secret API Key",
      description: "Decrypt and reveal the raw secret value of an API key. For accounts with custom encryption enabled, supply the user's vault_key.",
      inputSchema: {
        id: z.string().describe("The ID of the key to decrypt"),
        vault_key: z
          .string()
          .optional()
          .describe("Custom vault key (required only if the account uses custom encryption mode)"),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ id, vault_key }) => {
      try {
        const revealed = await client.revealKey(id, vault_key);
        return toolJson(revealed);
      } catch (err) {
        return mapClientError(err);
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
        vault_key: z.string().optional().describe("Custom vault key when required"),
      },
      annotations: {
        readOnlyHint: false,
      },
    },
    async ({ name, key, service, environment, notes, vault_key }) => {
      try {
        const created = await client.addKey(
          { name, key, service, environment, notes },
          vault_key,
        );
        return toolJson({ key: created });
      } catch (err) {
        return mapClientError(err);
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
        vault_key: z.string().optional().describe("Custom vault key when updating secret value"),
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
          vault_key,
        );
        return toolJson({ key: updated });
      } catch (err) {
        return mapClientError(err);
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
        return mapClientError(err);
      }
    },
  );

  return server;
}
