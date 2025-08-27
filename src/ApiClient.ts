import { randomUUID } from "crypto";

/**
 * CORS configuration options for API requests
 */
export interface CorsOptions {
  /** Include credentials (cookies, authorization headers) in cross-origin requests */
  credentials?: "include" | "same-origin" | "omit";
  /** Custom headers to include in preflight requests */
  allowedHeaders?: string[];
  /** HTTP methods to allow for CORS */
  allowedMethods?: string[];
  /** Maximum age for preflight cache in seconds */
  maxAge?: number;
}

/**
 * Idempotency configuration options for API requests
 */
export interface IdempotencyOptions {
  /** Enable automatic idempotency key generation for non-safe methods */
  enabled?: boolean;
  /** Custom idempotency header name (defaults to 'Idempotency-Key') */
  headerName?: string;
  /** Store and reuse idempotency keys for retries */
  enableRetryReuse?: boolean;
}

/**
 * HTTP API client with correlation ID support, robust error handling, and CORS best practices
 */
export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private corsOptions: CorsOptions;
  private idempotencyOptions: IdempotencyOptions;

  constructor(
    baseUrl: string,
    defaultHeaders: Record<string, string> = {},
    corsOptions: CorsOptions = {},
    idempotencyOptions: IdempotencyOptions = {}
  ) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = defaultHeaders;
    this.corsOptions = {
      credentials: "same-origin",
      allowedHeaders: ["Content-Type", "Authorization", "X-Correlation-ID"],
      allowedMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      maxAge: 86400, // 24 hours
      ...corsOptions,
    };
    this.idempotencyOptions = {
      enabled: false,
      headerName: "Idempotency-Key",
      enableRetryReuse: false,
      ...idempotencyOptions,
    };
  }

  async get<T>(endpoint: string, correlationId?: string): Promise<T> {
    const id = correlationId || randomUUID();
    console.log(`[${id}] GET ${this.baseUrl}${endpoint}`);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "GET",
      headers: {
        ...this.defaultHeaders,
        "X-Correlation-ID": id,
      },
      credentials: this.corsOptions.credentials,
    });

    if (!response.ok) {
      console.error(`[${id}] HTTP ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`[${id}] Response received: ${response.status}`);
    return this.parseResponse<T>(response);
  }

  async post<T>(
    endpoint: string,
    data: unknown,
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<T> {
    const id = correlationId || randomUUID();
    console.log(`[${id}] POST ${this.baseUrl}${endpoint}`);

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      "Content-Type": "application/json",
      "X-Correlation-ID": id,
    };

    // Add idempotency key if enabled or explicitly provided
    if (this.idempotencyOptions.enabled || idempotencyKey) {
      const key = idempotencyKey || randomUUID();
      const headerName =
        this.idempotencyOptions.headerName || "Idempotency-Key";
      headers[headerName] = key;
      console.log(`[${id}] Idempotency-Key: ${key}`);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers,
      credentials: this.corsOptions.credentials,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(`[${id}] HTTP ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`[${id}] Response received: ${response.status}`);
    return this.parseResponse<T>(response);
  }

  async put<T>(
    endpoint: string,
    data: unknown,
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<T> {
    const id = correlationId || randomUUID();
    console.log(`[${id}] PUT ${this.baseUrl}${endpoint}`);

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      "Content-Type": "application/json",
      "X-Correlation-ID": id,
    };

    // Add idempotency key if enabled or explicitly provided
    if (this.idempotencyOptions.enabled || idempotencyKey) {
      const key = idempotencyKey || randomUUID();
      const headerName =
        this.idempotencyOptions.headerName || "Idempotency-Key";
      headers[headerName] = key;
      console.log(`[${id}] Idempotency-Key: ${key}`);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "PUT",
      headers,
      credentials: this.corsOptions.credentials,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(`[${id}] HTTP ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`[${id}] Response received: ${response.status}`);
    return this.parseResponse<T>(response);
  }

  async patch<T>(
    endpoint: string,
    data: unknown,
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<T> {
    const id = correlationId || randomUUID();
    console.log(`[${id}] PATCH ${this.baseUrl}${endpoint}`);

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      "Content-Type": "application/json",
      "X-Correlation-ID": id,
    };

    // Add idempotency key if enabled or explicitly provided
    if (this.idempotencyOptions.enabled || idempotencyKey) {
      const key = idempotencyKey || randomUUID();
      const headerName =
        this.idempotencyOptions.headerName || "Idempotency-Key";
      headers[headerName] = key;
      console.log(`[${id}] Idempotency-Key: ${key}`);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "PATCH",
      headers,
      credentials: this.corsOptions.credentials,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(`[${id}] HTTP ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`[${id}] Response received: ${response.status}`);
    return this.parseResponse<T>(response);
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get("content-type");

    // Check if response has content
    if (response.status === 204 || !contentType) {
      return {} as T; // Return empty object for no content
    }

    // Check if content is JSON
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(
        `Expected JSON response but got ${contentType}: ${text.slice(0, 100)}`
      );
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      const text = await response.text();
      throw new Error(
        `Failed to parse JSON response: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Response: ${text.slice(0, 100)}`
      );
    }
  }
}
