import { describe, it, expect } from "vitest";
import { GET as getHealth, OPTIONS as optionsHealth } from "./route";
import { MCP_VERSION } from "@/lib/version";

describe("GET /health", () => {
  it("returns 204 on OPTIONS with CORS headers", async () => {
    const res = await optionsHealth();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("returns 200 OK with health status and metadata", async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("apivault-mcp");
    expect(body.version).toBe(MCP_VERSION);
    expect(body.timestamp).toBeDefined();
  });
});
