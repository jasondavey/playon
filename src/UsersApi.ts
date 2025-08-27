import { randomUUID } from "crypto";
import { UserValidator } from "./UserValidator.js";
import { RateLimiter, RateLimitOptions } from "./RateLimiter.js";
import { AuthService } from "./AuthService.js";

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
 * Users API client with CORS, idempotency, correlation ID, rate limiting, and authentication support
 */
export class UsersApi {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private corsOptions: CorsOptions;
  private idempotencyOptions: IdempotencyOptions;
  private rateLimiter?: RateLimiter;
  private authService?: AuthService;

  constructor(
    baseUrl: string,
    defaultHeaders: Record<string, string> = {},
    corsOptions: CorsOptions = {},
    idempotencyOptions: IdempotencyOptions = {},
    rateLimitOptions?: RateLimitOptions,
    authService?: AuthService
  ) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = defaultHeaders;
    this.corsOptions = {
      credentials: "same-origin",
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Correlation-ID",
        "X-User-ID",
        "X-Username",
      ],
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

    // Initialize rate limiter if options provided
    if (rateLimitOptions) {
      this.rateLimiter = new RateLimiter(rateLimitOptions);
    }

    // Set authentication service
    this.authService = authService;
  }

  /**
   * Get all users
   */
  async getUsers(correlationId?: string): Promise<User[]> {
    const id = correlationId || randomUUID();

    return this.executeWithAuth(
      async () => {
        return this.executeWithRateLimit(async () => {
          console.log(`[${id}] GET ${this.baseUrl}/users`);

          const response = await fetch(`${this.baseUrl}/users`, {
            method: "GET",
            headers: {
              ...this.defaultHeaders,
              "X-Correlation-ID": id,
              ...this.getAuthHeaders(id),
              ...this.getRateLimitHeaders(),
            },
            credentials: this.corsOptions.credentials,
          });

          if (!response.ok) {
            console.error(
              `[${id}] HTTP ${response.status}: ${response.statusText}`
            );
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          console.log(`[${id}] Response received: ${response.status}`);
          const rawData = await this.parseResponse<unknown>(response);

          // Validate response data
          return UserValidator.validateUsersArray(rawData, id);
        }, id);
      },
      id,
      ["user"]
    );
  }

  /**
   * Get user by ID
   */
  async getUser(userId: number, correlationId?: string): Promise<User> {
    const id = correlationId || randomUUID();

    // Validate input parameters
    const validatedUserId = UserValidator.validateUserId(userId, id);

    return this.executeWithAuth(
      async () => {
        return this.executeWithRateLimit(async () => {
          console.log(`[${id}] GET ${this.baseUrl}/users/${validatedUserId}`);

          const response = await fetch(
            `${this.baseUrl}/users/${validatedUserId}`,
            {
              method: "GET",
              headers: {
                ...this.defaultHeaders,
                "X-Correlation-ID": id,
                ...this.getAuthHeaders(id),
                ...this.getRateLimitHeaders(),
              },
              credentials: this.corsOptions.credentials,
            }
          );

          if (!response.ok) {
            console.error(
              `[${id}] HTTP ${response.status}: ${response.statusText}`
            );
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          console.log(`[${id}] Response received: ${response.status}`);
          const rawData = await this.parseResponse<unknown>(response);

          // Validate response data
          return UserValidator.validateUser(rawData, id);
        }, id);
      },
      id,
      ["user"]
    );
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

    return this.executeWithAuth(
      async () => {
        return this.executeWithRateLimit(async () => {
          console.log(`[${id}] POST ${this.baseUrl}/users`);

          const headers: Record<string, string> = {
            ...this.defaultHeaders,
            "Content-Type": "application/json",
            "X-Correlation-ID": id,
            ...this.getAuthHeaders(id),
            ...this.getRateLimitHeaders(),
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
            console.error(
              `[${id}] HTTP ${response.status}: ${response.statusText}`
            );
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          console.log(`[${id}] Response received: ${response.status}`);
          const rawData = await this.parseResponse<unknown>(response);

          // Validate response data
          return UserValidator.validateUser(rawData, id);
        }, id);
      },
      id,
      ["user"]
    );
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

    return this.executeWithAuth(
      async () => {
        return this.executeWithRateLimit(async () => {
          console.log(`[${id}] PUT ${this.baseUrl}/users/${validatedUserId}`);

          const headers: Record<string, string> = {
            ...this.defaultHeaders,
            "Content-Type": "application/json",
            "X-Correlation-ID": id,
            ...this.getAuthHeaders(id),
            ...this.getRateLimitHeaders(),
          };

          // Add idempotency key if enabled or explicitly provided
          if (this.idempotencyOptions.enabled || idempotencyKey) {
            const key = idempotencyKey || randomUUID();
            const headerName =
              this.idempotencyOptions.headerName || "Idempotency-Key";
            headers[headerName] = key;
            console.log(`[${id}] Idempotency-Key: ${key}`);
          }

          const response = await fetch(
            `${this.baseUrl}/users/${validatedUserId}`,
            {
              method: "PUT",
              headers,
              credentials: this.corsOptions.credentials,
              body: JSON.stringify(validatedUserData),
            }
          );

          if (!response.ok) {
            console.error(
              `[${id}] HTTP ${response.status}: ${response.statusText}`
            );
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          console.log(`[${id}] Response received: ${response.status}`);
          const rawData = await this.parseResponse<unknown>(response);

          // Validate response data
          return UserValidator.validateUser(rawData, id);
        }, id);
      },
      id,
      ["user"]
    );
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

    return this.executeWithAuth(
      async () => {
        return this.executeWithRateLimit(async () => {
          console.log(`[${id}] PATCH ${this.baseUrl}/users/${validatedUserId}`);

          const headers: Record<string, string> = {
            ...this.defaultHeaders,
            "Content-Type": "application/json",
            "X-Correlation-ID": id,
            ...this.getAuthHeaders(id),
            ...this.getRateLimitHeaders(),
          };

          // Add idempotency key if enabled or explicitly provided
          if (this.idempotencyOptions.enabled || idempotencyKey) {
            const key = idempotencyKey || randomUUID();
            const headerName =
              this.idempotencyOptions.headerName || "Idempotency-Key";
            headers[headerName] = key;
            console.log(`[${id}] Idempotency-Key: ${key}`);
          }

          const response = await fetch(
            `${this.baseUrl}/users/${validatedUserId}`,
            {
              method: "PATCH",
              headers,
              credentials: this.corsOptions.credentials,
              body: JSON.stringify(validatedUserData),
            }
          );

          if (!response.ok) {
            console.error(
              `[${id}] HTTP ${response.status}: ${response.statusText}`
            );
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          console.log(`[${id}] Response received: ${response.status}`);
          const rawData = await this.parseResponse<unknown>(response);

          // Validate response data
          return UserValidator.validateUser(rawData, id);
        }, id);
      },
      id,
      ["user"]
    );
  }

  /**
   * Delete user by ID (requires admin role)
   */
  async deleteUser(userId: number, correlationId?: string): Promise<void> {
    const id = correlationId || randomUUID();

    // Validate input parameters
    const validatedUserId = UserValidator.validateUserId(userId, id);

    return this.executeWithAuth(
      async () => {
        return this.executeWithRateLimit(async () => {
          console.log(
            `[${id}] DELETE ${this.baseUrl}/users/${validatedUserId}`
          );

          const response = await fetch(
            `${this.baseUrl}/users/${validatedUserId}`,
            {
              method: "DELETE",
              headers: {
                ...this.defaultHeaders,
                "X-Correlation-ID": id,
                ...this.getAuthHeaders(id),
                ...this.getRateLimitHeaders(),
              },
              credentials: this.corsOptions.credentials,
            }
          );

          if (!response.ok) {
            console.error(
              `[${id}] HTTP ${response.status}: ${response.statusText}`
            );
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          console.log(`[${id}] Response received: ${response.status}`);
        }, id);
      },
      id,
      ["admin"]
    ); // Delete requires admin role
  }

  /**
   * Get current rate limit status
   */
  public getRateLimitStatus() {
    return this.rateLimiter?.getStatus();
  }

  /**
   * Reset rate limiter (useful for testing)
   */
  public resetRateLimit(): void {
    this.rateLimiter?.reset();
  }

  /**
   * Get authentication status
   */
  public getAuthStatus() {
    return this.authService?.getSessionStatus();
  }

  /**
   * Set authentication service
   */
  public setAuthService(authService: AuthService): void {
    this.authService = authService;
  }

  /**
   * Execute function with authentication and authorization checks
   */
  private async executeWithAuth<T>(
    fn: () => Promise<T>,
    correlationId: string,
    requiredRoles: string[] = ["user"]
  ): Promise<T> {
    if (this.authService) {
      // Fail-fast: Validate session and check authorization
      this.authService.validateSession(correlationId);
      this.authService.checkAuthorization(requiredRoles, correlationId);
    }
    return fn();
  }

  /**
   * Execute function with rate limiting if enabled
   */
  private async executeWithRateLimit<T>(
    fn: () => Promise<T>,
    correlationId: string
  ): Promise<T> {
    if (this.rateLimiter) {
      return this.rateLimiter.execute(fn, correlationId);
    }
    return fn();
  }

  /**
   * Get authentication headers if auth service is enabled
   */
  private getAuthHeaders(correlationId: string): Record<string, string> {
    if (this.authService) {
      return this.authService.getAuthHeaders(correlationId);
    }
    return {};
  }

  /**
   * Get rate limit headers if rate limiter is enabled
   */
  private getRateLimitHeaders(): Record<string, string> {
    return this.rateLimiter?.getHeaders() || {};
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
