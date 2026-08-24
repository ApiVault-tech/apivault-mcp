import { describe, expect, it } from "vitest";
import { GET as getServerCard, OPTIONS as optionsServerCard } from "@/app/mcp/server-card/route";
import { GET as getLegacyServerCard } from "@/app/server-card/route";
import { GET as getWellKnownServerCard } from "@/app/.well-known/mcp/server-card/route";
import { getMcpServerCard } from "./mcp-server-card";
import { MCP_VERSION } from "./version";

describe("mcp-server-card", () => {
  it("matches SEP-2127 required fields without a singular icon property", () => {
    const card = getMcpServerCard();
    expect(card.$schema).toContain("server-card.schema.json");
    expect(card.name).toBe("app.apivault/vault");
    expect(card.title).toBe("ApiVault");
    expect(MCP_VERSION).toBe("1.0.2");
    expect(card.version).toBe(MCP_VERSION);
    const expectedApiVault = process.env.API_VAULT_URL ? process.env.API_VAULT_URL.replace(/\/+$/, "") : "https://apivault.tech";
    const expectedMcp = process.env.MCP_SERVER_URL ? process.env.MCP_SERVER_URL.replace(/\/+$/, "") : "https://mcp.apivault.tech";
    expect(card.websiteUrl).toBe(expectedApiVault);
    expect(card.remotes).toEqual([
      {
        type: "streamable-http",
        url: `${expectedMcp}/mcp`,
        supportedProtocolVersions: ["2025-11-25", "2025-06-18", "2025-03-26"],
      },
    ]);
    expect(card.icons.length).toBeGreaterThanOrEqual(4);
    expect(card).not.toHaveProperty("icon");
  });
});

describe("GET /mcp/server-card", () => {
  it("returns 204 on OPTIONS with CORS headers", async () => {
    const res = await optionsServerCard();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns application/mcp-server-card+json", async () => {
    const res = await getServerCard();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/mcp-server-card+json");
    const body = await res.json();
    const expectedMcp = process.env.MCP_SERVER_URL ? process.env.MCP_SERVER_URL.replace(/\/+$/, "") : "https://mcp.apivault.tech";
    expect(body.remotes[0].url).toBe(`${expectedMcp}/mcp`);
  });
});

describe("server-card redirects", () => {
  it("redirects /server-card to /mcp/server-card", async () => {
    const res = await getLegacyServerCard(
      new Request("https://mcp.apivault.tech/server-card"),
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://mcp.apivault.tech/mcp/server-card");
  });

  it("redirects /.well-known/mcp/server-card to /mcp/server-card", async () => {
    const res = await getWellKnownServerCard(
      new Request("https://mcp.apivault.tech/.well-known/mcp/server-card"),
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://mcp.apivault.tech/mcp/server-card");
  });
});
