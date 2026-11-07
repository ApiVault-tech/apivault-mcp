import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const calls = vi.hoisted(() => ({
  revealKey: vi.fn(),
  addKey: vi.fn(),
  updateKey: vi.fn(),
}));

vi.mock("../lib/apivault-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/apivault-client")>();
  class ApiVaultClient {
    revealKey = calls.revealKey;
    addKey = calls.addKey;
    updateKey = calls.updateKey;
  }
  return { ...actual, ApiVaultClient };
});

import { ApiVaultError } from "../lib/apivault-client";
import { createMcpServer, readConnectionVaultKey } from "./server";

async function connect(connectionVaultKey?: string) {
  const server = createMcpServer("oauth-token", connectionVaultKey);
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  return (result.content as { text: string }[])[0].text;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readConnectionVaultKey", () => {
  it("reads a trimmed X-Vault-Key header and ignores a blank one", () => {
    expect(readConnectionVaultKey(new Headers({ "X-Vault-Key": " vk-123 " }))).toBe("vk-123");
    expect(readConnectionVaultKey(new Headers({ "X-Vault-Key": "" }))).toBeUndefined();
    expect(readConnectionVaultKey(new Headers())).toBeUndefined();
  });
});

describe("vault key from the connection", () => {
  it("forwards the header's key, ignoring a vault_key argument", async () => {
    calls.revealKey.mockResolvedValue({ id: "k1", name: "A", rawKey: "sk_test" });
    calls.addKey.mockResolvedValue({ id: "k2" });
    calls.updateKey.mockResolvedValue({ id: "k2" });
    const client = await connect("from-header");

    await client.callTool({ name: "reveal_key", arguments: { id: "k1", vault_key: "from-chat" } });
    await client.callTool({ name: "add_key", arguments: { name: "A", key: "v" } });
    await client.callTool({ name: "update_key", arguments: { id: "k2", key: "v2" } });

    expect(calls.revealKey).toHaveBeenCalledWith("k1", "from-header");
    expect(calls.addKey.mock.calls[0][1]).toBe("from-header");
    expect(calls.updateKey.mock.calls[0][2]).toBe("from-header");
  });

  it("falls back to the argument when no header is configured", async () => {
    calls.revealKey.mockResolvedValue({ id: "k1", name: "A", rawKey: "x" });
    const client = await connect();

    await client.callTool({ name: "reveal_key", arguments: { id: "k1", vault_key: "typed" } });

    expect(calls.revealKey).toHaveBeenCalledWith("k1", "typed");
  });

  it("tells the agent to have the header set up instead of asking for the key", async () => {
    calls.revealKey.mockRejectedValue(new ApiVaultError("A vault key is required.", 400, "VAULT_KEY_REQUIRED"));
    const client = await connect();

    const result = await client.callTool({ name: "reveal_key", arguments: { id: "k1" } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("X-Vault-Key header");
  });

  it("points a wrong header key back to the client settings", async () => {
    calls.revealKey.mockRejectedValue(new ApiVaultError("Invalid vault key.", 400, "INVALID_VAULT_KEY"));
    const client = await connect("wrong");

    const result = await client.callTool({ name: "reveal_key", arguments: { id: "k1" } });

    expect(textOf(result)).toContain("correct it in their client's settings");
  });
});
