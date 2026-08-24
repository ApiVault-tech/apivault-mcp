import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server";
import { ApiVaultClient, ApiVaultError } from "../lib/apivault-client";
import { MCP_VERSION } from "../lib/version";

function getTextContent(res: any): string {
  const content = res?.content as Array<{ type: string; text: string }> | undefined;
  return content?.[0]?.text ?? "";
}

function getJsonContent<T = any>(res: any): T {
  return JSON.parse(getTextContent(res)) as T;
}

describe("McpServer & Tool Implementations", () => {
  let client: Client;
  let server: ReturnType<typeof createMcpServer>;

  beforeEach(async () => {
    vi.restoreAllMocks();

    server = createMcpServer("test-mcp-bearer-token");
    client = new Client(
      { name: "test-mcp-client", version: "1.0.0" },
      { capabilities: {} },
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    try {
      await client.close();
    } catch {}
    try {
      await server.close();
    } catch {}
  });

  describe("Server initialization & tool discovery", () => {
    it("advertises server capabilities and metadata during handshake", () => {
      const serverVersion = client.getServerVersion();
      expect(serverVersion).toEqual(
        expect.objectContaining({
          name: "apivault",
          version: MCP_VERSION,
          title: "ApiVault",
        }),
      );
    });

    it("lists all 6 expected tools with annotations, descriptions, and input schemas", async () => {
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);

      expect(toolNames).toEqual([
        "list_keys",
        "get_key",
        "reveal_key",
        "add_key",
        "update_key",
        "delete_key",
      ]);

      const listKeysTool = toolsResult.tools.find((t) => t.name === "list_keys")!;
      expect(listKeysTool.title).toBe("List API Keys");
      expect(listKeysTool.annotations?.readOnlyHint).toBe(true);

      const deleteKeyTool = toolsResult.tools.find((t) => t.name === "delete_key")!;
      expect(deleteKeyTool.title).toBe("Delete API Key");
      expect(deleteKeyTool.annotations?.destructiveHint).toBe(true);
    });
  });

  describe("tool: list_keys", () => {
    it("calls ApiVaultClient.listKeys and returns masked keys", async () => {
      const mockKeys = [
        {
          id: "key_1",
          name: "OPENAI_API_KEY",
          service: "OpenAI",
          environment: "Production",
          notes: "Main key",
          masked: "sk-••••abcd",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
          last_used: null,
        },
      ];

      vi.spyOn(ApiVaultClient.prototype, "listKeys").mockResolvedValueOnce(mockKeys);

      const res = await client.callTool({
        name: "list_keys",
        arguments: { environment: "Production", service: "OpenAI" },
      });

      expect(res.isError).toBeFalsy();
      const parsed = getJsonContent<{ keys: typeof mockKeys }>(res);
      expect(parsed.keys).toEqual(mockKeys);
      expect(ApiVaultClient.prototype.listKeys).toHaveBeenCalledWith({
        environment: "Production",
        service: "OpenAI",
      });
    });

    it("handles ApiVaultError gracefully with isError: true and code metadata", async () => {
      vi.spyOn(ApiVaultClient.prototype, "listKeys").mockRejectedValueOnce(
        new ApiVaultError("Insufficient scope for keys:read", 403, "INSUFFICIENT_SCOPE"),
      );

      const res = await client.callTool({
        name: "list_keys",
        arguments: {},
      });

      expect(res.isError).toBe(true);
      expect(getTextContent(res)).toContain("Insufficient scope");
      expect(res._meta).toEqual(expect.objectContaining({ code: "INSUFFICIENT_SCOPE" }));
    });
  });

  describe("tool: get_key", () => {
    it("retrieves a single key metadata by id", async () => {
      const mockKey = {
        id: "key_123",
        name: "STRIPE_KEY",
        service: "Stripe",
        environment: "Production",
        notes: "",
        masked: "sk_live_••••5678",
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-18T00:00:00.000Z",
        last_used: null,
      };

      vi.spyOn(ApiVaultClient.prototype, "getKey").mockResolvedValueOnce(mockKey);

      const res = await client.callTool({
        name: "get_key",
        arguments: { id: "key_123" },
      });

      expect(res.isError).toBeFalsy();
      const parsed = getJsonContent<{ key: typeof mockKey }>(res);
      expect(parsed.key).toEqual(mockKey);
      expect(ApiVaultClient.prototype.getKey).toHaveBeenCalledWith("key_123");
    });

    it("handles not found error when key does not exist", async () => {
      vi.spyOn(ApiVaultClient.prototype, "getKey").mockRejectedValueOnce(
        new ApiVaultError("Key not found", 404, "NOT_FOUND"),
      );

      const res = await client.callTool({
        name: "get_key",
        arguments: { id: "non_existent" },
      });

      expect(res.isError).toBe(true);
      expect(getTextContent(res)).toContain("Key not found");
      expect(res._meta).toEqual(expect.objectContaining({ code: "NOT_FOUND" }));
    });

    it("returns schema error when required id is missing", async () => {
      const res = await client.callTool({
        name: "get_key",
        arguments: {},
      });

      expect(res.isError).toBe(true);
      expect(getTextContent(res)).toContain("id");
    });
  });

  describe("tool: reveal_key", () => {
    it("decrypts and reveals raw secret value", async () => {
      const mockRevealed = {
        id: "key_123",
        name: "STRIPE_SECRET",
        rawKey: "sk_live_supersecretvalue",
      };

      vi.spyOn(ApiVaultClient.prototype, "revealKey").mockResolvedValueOnce(mockRevealed);

      const res = await client.callTool({
        name: "reveal_key",
        arguments: { id: "key_123", vault_key: "custom-pass" },
      });

      expect(res.isError).toBeFalsy();
      const parsed = getJsonContent<typeof mockRevealed>(res);
      expect(parsed).toEqual(mockRevealed);
      expect(ApiVaultClient.prototype.revealKey).toHaveBeenCalledWith("key_123", "custom-pass");
    });

    it("returns VAULT_KEY_REQUIRED error when custom encryption key is missing", async () => {
      vi.spyOn(ApiVaultClient.prototype, "revealKey").mockRejectedValueOnce(
        new ApiVaultError("Vault key required", 401, "VAULT_KEY_REQUIRED"),
      );

      const res = await client.callTool({
        name: "reveal_key",
        arguments: { id: "key_123" },
      });

      expect(res.isError).toBe(true);
      expect(res._meta).toEqual(expect.objectContaining({ code: "VAULT_KEY_REQUIRED" }));
    });
  });

  describe("tool: add_key", () => {
    it("adds a new key to the vault", async () => {
      const mockCreated = {
        id: "key_new",
        name: "AWS_SECRET_ACCESS_KEY",
        service: "AWS",
        environment: "Production",
        notes: "DevOps key",
        masked: "••••••••",
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-18T00:00:00.000Z",
        last_used: null,
      };

      vi.spyOn(ApiVaultClient.prototype, "addKey").mockResolvedValueOnce(mockCreated);

      const res = await client.callTool({
        name: "add_key",
        arguments: {
          name: "AWS_SECRET_ACCESS_KEY",
          key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
          service: "AWS",
          environment: "Production",
          notes: "DevOps key",
          vault_key: "my-vault-key",
        },
      });

      expect(res.isError).toBeFalsy();
      const parsed = getJsonContent<{ key: typeof mockCreated }>(res);
      expect(parsed.key).toEqual(mockCreated);
      expect(ApiVaultClient.prototype.addKey).toHaveBeenCalledWith(
        {
          name: "AWS_SECRET_ACCESS_KEY",
          key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
          service: "AWS",
          environment: "Production",
          notes: "DevOps key",
        },
        "my-vault-key",
      );
    });

    it("returns error when key name is duplicated", async () => {
      vi.spyOn(ApiVaultClient.prototype, "addKey").mockRejectedValueOnce(
        new ApiVaultError("Key name already exists", 409, "DUPLICATE_KEY"),
      );

      const res = await client.callTool({
        name: "add_key",
        arguments: {
          name: "EXISTING_KEY",
          key: "some-value",
        },
      });

      expect(res.isError).toBe(true);
      expect(res._meta).toEqual(expect.objectContaining({ code: "DUPLICATE_KEY" }));
    });

    it("fails validation when key secret value is missing", async () => {
      const res = await client.callTool({
        name: "add_key",
        arguments: {
          name: "INCOMPLETE_KEY",
        },
      });

      expect(res.isError).toBe(true);
    });
  });

  describe("tool: update_key", () => {
    it("updates key metadata and secret value", async () => {
      const mockUpdated = {
        id: "key_1",
        name: "STRIPE_KEY_UPDATED",
        service: "Stripe",
        environment: "Staging",
        notes: "Updated staging key",
        masked: "sk_test_••••9999",
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-18T01:00:00.000Z",
        last_used: null,
      };

      vi.spyOn(ApiVaultClient.prototype, "updateKey").mockResolvedValueOnce(mockUpdated);

      const res = await client.callTool({
        name: "update_key",
        arguments: {
          id: "key_1",
          name: "STRIPE_KEY_UPDATED",
          environment: "Staging",
          notes: "Updated staging key",
          key: "sk_test_newsecretvalue",
          vault_key: "pass123",
        },
      });

      expect(res.isError).toBeFalsy();
      const parsed = getJsonContent<{ key: typeof mockUpdated }>(res);
      expect(parsed.key).toEqual(mockUpdated);
      expect(ApiVaultClient.prototype.updateKey).toHaveBeenCalledWith(
        "key_1",
        {
          name: "STRIPE_KEY_UPDATED",
          service: undefined,
          environment: "Staging",
          notes: "Updated staging key",
          key: "sk_test_newsecretvalue",
        },
        "pass123",
      );
    });
  });

  describe("tool: delete_key", () => {
    it("deletes a key permanently by id", async () => {
      vi.spyOn(ApiVaultClient.prototype, "deleteKey").mockResolvedValueOnce({
        deleted: true,
        id: "key_to_delete",
      });

      const res = await client.callTool({
        name: "delete_key",
        arguments: { id: "key_to_delete" },
      });

      expect(res.isError).toBeFalsy();
      const parsed = getJsonContent<{ deleted: boolean; id: string }>(res);
      expect(parsed).toEqual({ deleted: true, id: "key_to_delete" });
      expect(ApiVaultClient.prototype.deleteKey).toHaveBeenCalledWith("key_to_delete");
    });
  });
});
