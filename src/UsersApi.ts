import { randomUUID } from "crypto";
import { UserValidator } from "./UserValidator.js";

/**
 * User data structure
 */
export interface User {
  id?: number;
  name: string;
  username?: string;
  email: string;
  phone?: string;
  website?: string;
  address?: {
    street: string;
    suite: string;
    city: string;
    zipcode: string;
  };
  company?: {
    name: string;
    catchPhrase: string;
    bs: string;
  };
}

/**
 * User creation data (without id)
 */
export interface CreateUserData {
  name: string;
  username: string;
  email: string;
  phone?: string;
  website?: string;
}

/**
 * User update data (partial)
 */
export interface UpdateUserData {
  name?: string;
  username?: string;
  email?: string;
  phone?: string;
  website?: string;
}

/**
 * Simple type guard function type
 */
export type TypeGuard<T> = (data: unknown) => data is T;

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
 * Users API client with CORS, idempotency, and correlation ID support
 */
export class UsersApi {
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
      allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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

  /**
   * Get all users
   */
  async getUsers(correlationId?: string): Promise<User[]> {
    const id = correlationId || randomUUID();
    console.log(`[${id}] GET ${this.baseUrl}/users`);

    const response = await fetch(`${this.baseUrl}/users`, {
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
    const rawData = await this.parseResponse<unknown>(response);

    // Validate response data
    return UserValidator.validateUsersArray(rawData, id);
  }

  /**
   * Get user by ID
   */
  async getUser(userId: number, correlationId?: string): Promise<User> {
    const id = correlationId || randomUUID();

    // Validate input parameters
    const validatedUserId = UserValidator.validateUserId(userId, id);

    console.log(`[${id}] GET ${this.baseUrl}/users/${validatedUserId}`);

    const response = await fetch(`${this.baseUrl}/users/${validatedUserId}`, {
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
    const rawData = await this.parseResponse<unknown>(response);

    // Validate response data
    return UserValidator.validateUser(rawData, id);
  }

  /**
   * Create a new user
   */
  async createUser(
    userData: CreateUserData,
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<User> {
    const id = correlationId || randomUUID();

    // Validate input data
    const validatedUserData = UserValidator.validateCreateUserData(
      userData,
      id
    );

    console.log(`[${id}] POST ${this.baseUrl}/users`);

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

    const response = await fetch(`${this.baseUrl}/users`, {
      method: "POST",
      headers,
      credentials: this.corsOptions.credentials,
      body: JSON.stringify(validatedUserData),
    });

    if (!response.ok) {
      console.error(`[${id}] HTTP ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`[${id}] Response received: ${response.status}`);
    const rawData = await this.parseResponse<unknown>(response);

    // Validate response data
    return UserValidator.validateUser(rawData, id);
  }

  /**
   * Update user by ID
   */
  async updateUser(
    userId: number,
    userData: UpdateUserData,
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<User> {
    const id = correlationId || randomUUID();

    // Validate input parameters
    const validatedUserId = UserValidator.validateUserId(userId, id);
    const validatedUserData = UserValidator.validateUpdateUserData(
      userData,
      id
    );

    console.log(`[${id}] PUT ${this.baseUrl}/users/${validatedUserId}`);

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

    const response = await fetch(`${this.baseUrl}/users/${validatedUserId}`, {
      method: "PUT",
      headers,
      credentials: this.corsOptions.credentials,
      body: JSON.stringify(validatedUserData),
    });

    if (!response.ok) {
      console.error(`[${id}] HTTP ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`[${id}] Response received: ${response.status}`);
    const rawData = await this.parseResponse<unknown>(response);

    // Validate response data
    return UserValidator.validateUser(rawData, id);
  }

  /**
   * Partially update user by ID
   */
  async patchUser(
    userId: number,
    userData: UpdateUserData,
    correlationId?: string,
    idempotencyKey?: string
  ): Promise<User> {
    const id = correlationId || randomUUID();

    // Validate input parameters
    const validatedUserId = UserValidator.validateUserId(userId, id);
    const validatedUserData = UserValidator.validateUpdateUserData(
      userData,
      id
    );

    console.log(`[${id}] PATCH ${this.baseUrl}/users/${validatedUserId}`);

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

    const response = await fetch(`${this.baseUrl}/users/${validatedUserId}`, {
      method: "PATCH",
      headers,
      credentials: this.corsOptions.credentials,
      body: JSON.stringify(validatedUserData),
    });

    if (!response.ok) {
      console.error(`[${id}] HTTP ${response.status}: ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`[${id}] Response received: ${response.status}`);
    const rawData = await this.parseResponse<unknown>(response);

    // Validate response data
    return UserValidator.validateUser(rawData, id);
  }

  /**
   * Delete user by ID
   */
  async deleteUser(userId: number, correlationId?: string): Promise<void> {
    const id = correlationId || randomUUID();

    // Validate input parameters
    const validatedUserId = UserValidator.validateUserId(userId, id);

    console.log(`[${id}] DELETE ${this.baseUrl}/users/${validatedUserId}`);

    const response = await fetch(`${this.baseUrl}/users/${validatedUserId}`, {
      method: "DELETE",
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
