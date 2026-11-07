import { getMcpServerUrl } from "@/lib/config";
import { handleMcpRequest as processMcpRequest } from "@/mcp/session-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-Id, X-Secret-Key, X-Vault-Key",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function readBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1].trim() : null;
}

function unauthorizedResponse(): Response {
  const prmUrl = `${getMcpServerUrl()}/.well-known/oauth-protected-resource`;
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer realm="mcp", resource_metadata="${prmUrl}"`,
      ...CORS_HEADERS,
    },
  });
}

async function handleMcpRequest(req: Request): Promise<Response> {
  const token = readBearerToken(req);
  if (!token) {
    return unauthorizedResponse();
  }

  try {
    const res = await processMcpRequest(req, token);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => {
      res.headers.set(k, v);
    });
    return res;
  } catch (error) {
    console.error(`MCP ${req.method} error:`, error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

export async function GET(req: Request) {
  return handleMcpRequest(req);
}

export async function POST(req: Request) {
  return handleMcpRequest(req);
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req);
}
