import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer, readConnectionVaultKey } from "./server";

function jsonRpcError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

/**
 * Handles incoming MCP requests.
 * - POST: Processes JSON-RPC requests (initialize, tools/list, tools/call) statelessly.
 * - GET: Returns 405 — this stateless server does not support standalone SSE streams
 *   (no server-initiated push / resources/subscribe). Returning 405 signals MCP clients
 *   to stop attempting the background SSE connection entirely.
 * - DELETE: Delegates to transport (returns 405 in stateless mode).
 */
export async function handleMcpRequest(req: Request, token: string): Promise<Response> {
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method Not Allowed: This server does not support standalone SSE streams" },
        id: null,
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Allow": "POST, OPTIONS, DELETE",
        },
      },
    );
  }

  let parsedBody: unknown;

  if (req.method === "POST") {
    try {
      parsedBody = await req.json();
    } catch {
      return jsonRpcError(400, "Parse error: Invalid JSON");
    }
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: false,
  });

  const server = createMcpServer(token, readConnectionVaultKey(req.headers));
  await server.connect(transport);

  return transport.handleRequest(req, parsedBody !== undefined ? { parsedBody } : undefined);
}

/** Backwards-compatible alias for existing imports. */
export const handleStatefulMcpRequest = handleMcpRequest;

export function __resetMcpSessionsForTests() {
  // Stateless mode holds no persistent session state
}

