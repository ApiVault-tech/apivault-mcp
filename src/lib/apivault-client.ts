import { getApiVaultUrl } from "./config";

export interface MaskedKey {
  id: string;
  name: string;
  service: string;
  environment: string;
  notes: string;
  masked: string;
  createdAt: string;
  updatedAt: string;
  last_used: string | null;
}

export class ApiVaultError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiVaultError";
    this.status = status;
    this.code = code;
  }
}

export class ApiVaultClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl?: string) {
    this.token = token;
    this.baseUrl = (baseUrl ?? getApiVaultUrl()).replace(/\/+$/, "");
  }

  private async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
      vaultKey?: string;
      params?: Record<string, string | undefined>;
    } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, value);
        }
      }
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.token}`,
      "Accept": "application/json",
      "User-Agent": "apivault-mcp/1.0.3 (@modelcontextprotocol/sdk)",
    };

    if (options.vaultKey) {
      headers["x-vault-key"] = options.vaultKey;
    }

    let requestBody: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: options.method ?? "GET",
        headers,
        body: requestBody,
      });
    } catch (networkError) {
      throw new ApiVaultError(
        `Failed to reach ApiVault server at ${this.baseUrl}. Please check network connection.`,
        503,
        "NETWORK_ERROR",
      );
    }

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // Empty response or non-json
    }

    if (!response.ok) {
      const errorMsg = data?.error || `ApiVault request failed with status ${response.status}`;
      const errorCode = data?.code || (response.status === 401 ? "UNAUTHORIZED" : response.status === 403 ? "FORBIDDEN" : undefined);
      throw new ApiVaultError(errorMsg, response.status, errorCode);
    }

    return data as T;
  }

  async listKeys(filters?: { environment?: string; service?: string }): Promise<MaskedKey[]> {
    const data = await this.request<{ keys: MaskedKey[] }>("/api/mcp/v1/keys", {
      method: "GET",
      params: filters,
    });
    return data.keys ?? [];
  }

  async getKey(id: string): Promise<MaskedKey> {
    const data = await this.request<{ key: MaskedKey }>(`/api/mcp/v1/keys/${encodeURIComponent(id)}`, {
      method: "GET",
    });
    return data.key;
  }

  async revealKey(id: string, vaultKey?: string): Promise<{ id: string; name: string; rawKey: string }> {
    return this.request<{ id: string; name: string; rawKey: string }>(
      `/api/mcp/v1/keys/${encodeURIComponent(id)}/reveal`,
      {
        method: "POST",
        vaultKey,
      },
    );
  }

  async addKey(
    input: {
      name: string;
      key: string;
      service?: string;
      environment?: string;
      notes?: string;
    },
    vaultKey?: string,
  ): Promise<MaskedKey> {
    const data = await this.request<{ key: MaskedKey }>("/api/mcp/v1/keys", {
      method: "POST",
      body: input,
      vaultKey,
    });
    return data.key;
  }

  async updateKey(
    id: string,
    input: {
      name?: string;
      service?: string;
      environment?: string;
      notes?: string;
      key?: string;
    },
    vaultKey?: string,
  ): Promise<MaskedKey> {
    const data = await this.request<{ key: MaskedKey }>(`/api/mcp/v1/keys/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: input,
      vaultKey,
    });
    return data.key;
  }

  async deleteKey(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.request<{ deleted: boolean; id: string }>(
      `/api/mcp/v1/keys/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
  }
}
