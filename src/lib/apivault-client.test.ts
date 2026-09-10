import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiVaultClient, ApiVaultError } from "./apivault-client";
import { MCP_VERSION } from "./version";

describe("ApiVaultClient", () => {
  const token = "test_mcp_access_token";
  let client: ApiVaultClient;

  beforeEach(() => {
    client = new ApiVaultClient(token, "https://api-vault-test.example.com");
    vi.restoreAllMocks();
  });

  it("lists keys with Authorization header and query params", async () => {
    const mockKeys = [
      {
        id: "key_1",
        name: "STRIPE_SECRET_KEY",
        service: "Stripe",
        environment: "Production",
        notes: "",
        masked: "sk_live_••••1234",
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-18T00:00:00.000Z",
        last_used: null,
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ keys: mockKeys }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const keys = await client.listKeys({ environment: "Production" });
    expect(keys).toEqual(mockKeys);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api-vault-test.example.com/api/mcp/v1/keys?environment=Production",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        }),
      }),
    );
  });

  it("reveals key with optional vault key in x-vault-key header", async () => {
    const mockRevealed = { id: "key_1", name: "STRIPE_KEY", rawKey: "sk_live_secret_123456" };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockRevealed), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await client.revealKey("key_1", "my-vault-key");
    expect(result).toEqual(mockRevealed);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api-vault-test.example.com/api/mcp/v1/keys/key_1/reveal",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Authorization": `Bearer ${token}`,
          "x-vault-key": "my-vault-key",
        }),
      }),
    );
  });

  it("throws ApiVaultError with code on 401/403 or custom errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: "Your vault is protected by a custom key.", code: "VAULT_KEY_REQUIRED" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(client.revealKey("key_1")).rejects.toThrow(ApiVaultError);

    try {
      await client.revealKey("key_1");
    } catch (err) {
      if (err instanceof ApiVaultError) {
        expect(err.code).toBe("VAULT_KEY_REQUIRED");
        expect(err.status).toBe(401);
      }
    }
  });

  it("surfaces the vault-key throttle's Retry-After on a 429", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "Too many incorrect vault keys. Please wait before trying again.",
          code: "VAULT_KEY_RATE_LIMITED",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "420" },
        },
      ),
    );

    try {
      await client.revealKey("key_1", "wrong-vault-key");
      expect.unreachable("revealKey should reject on a 429");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiVaultError);
      const apiErr = err as ApiVaultError;
      expect(apiErr.status).toBe(429);
      expect(apiErr.code).toBe("VAULT_KEY_RATE_LIMITED");
      expect(apiErr.retryAfterSeconds).toBe(420);
      // The agent needs the wait in the message, not just on the object —
      // only the message reaches the model through the tool result.
      expect(apiErr.message).toContain("Retry after 420 seconds");
    }
  });

  it("labels an unannotated 429 as RATE_LIMITED without inventing a delay", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Slow down." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      await client.listKeys();
      expect.unreachable("listKeys should reject on a 429");
    } catch (err) {
      const apiErr = err as ApiVaultError;
      expect(apiErr.code).toBe("RATE_LIMITED");
      expect(apiErr.retryAfterSeconds).toBeUndefined();
      expect(apiErr.message).toBe("Slow down.");
    }
  });

  it("reports its own package version in the User-Agent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ keys: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await client.listKeys();

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers["User-Agent"]).toBe(
      `apivault-mcp/${MCP_VERSION} (@modelcontextprotocol/sdk)`,
    );
  });

  it("adds a new key with POST body", async () => {
    const mockCreated = {
      id: "key_2",
      name: "OPENAI_API_KEY",
      service: "OpenAI",
      environment: "Production",
      notes: "prod key",
      masked: "sk-••••abcd",
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
      last_used: null,
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ key: mockCreated }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await client.addKey({
      name: "OPENAI_API_KEY",
      key: "sk-1234567890abcdef",
      service: "OpenAI",
      environment: "Production",
    });

    expect(result).toEqual(mockCreated);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api-vault-test.example.com/api/mcp/v1/keys",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "OPENAI_API_KEY",
          key: "sk-1234567890abcdef",
          service: "OpenAI",
          environment: "Production",
        }),
      }),
    );
  });
});
