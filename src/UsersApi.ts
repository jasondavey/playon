import { randomUUID } from "crypto";
import { UserValidator } from "./UserValidator.js";
import { RateLimiter, RateLimitOptions } from "./RateLimiter.js";
import { AuthService } from "./AuthService.js";
import { PerformanceMonitor, PerformanceTimer } from "./PerformanceMonitor.js";

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
 * Users API client with CORS, idempotency, correlation ID, rate limiting, authentication, and performance monitoring support
 */
export class UsersApi {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private corsOptions: CorsOptions;
  private idempotencyOptions: IdempotencyOptions;
  private rateLimiter?: RateLimiter;
  private authService?: AuthService;
  private performanceMonitor?: PerformanceMonitor;

  constructor(
    baseUrl: string,
    defaultHeaders: Record<string, string> = {},
    corsOptions: CorsOptions = {},
    idempotencyOptions: IdempotencyOptions = {},
    rateLimitOptions?: RateLimitOptions,
    authService?: AuthService,
    performanceMonitor?: PerformanceMonitor
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

    // Set performance monitor
    this.performanceMonitor = performanceMonitor;
  }

  /**
   * Get all users
   */
  async getUsers(correlationId?: string): Promise<User[]> {
    const id = correlationId || randomUUID();
    const timer = this.performanceMonitor?.createTimer();

    try {
      return await this.executeWithAuth(
        async () => {
          return this.executeWithRateLimit(async () => {
            timer?.startPhase("network");
            console.log(`[${id}] GET ${this.baseUrl}/users`);

            const requestSize = this.calculateHeadersSize({
              ...this.defaultHeaders,
              "X-Correlation-ID": id,
              ...this.getAuthHeaders(id),
              ...this.getRateLimitHeaders(),
            });

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

            timer?.endPhase("network");
            timer?.startPhase("validation");

            if (!response.ok) {
              console.error(
                `[${id}] HTTP ${response.status}: ${response.statusText}`
              );
              throw new Error(
                `HTTP ${response.status}: ${response.statusText}`
              );
            }

            console.log(`[${id}] Response received: ${response.status}`);
            const rawData = await this.parseResponse<unknown>(response);

            // Validate response data
            const result = UserValidator.validateUsersArray(rawData, id);
            timer?.endPhase("validation");

            // Log performance metrics
            this.logPerformanceMetrics(
              timer,
              id,
              "GET",
              `${this.baseUrl}/users`,
              response.status,
              requestSize,
              this.calculateResponseSize(result)
            );

            return result;
          }, id);
        },
        id,
        ["user"],
        timer
      );
    } catch (error) {
      this.logPerformanceMetrics(
        timer,
        id,
        "GET",
        `${this.baseUrl}/users`,
        undefined,
        undefined,
        undefined,
        error
      );
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUser(userId: number, correlationId?: string): Promise<User> {
    const id = correlationId || randomUUID();
    const timer = this.performanceMonitor?.createTimer();

    // Validate input parameters
    const validatedUserId = UserValidator.validateUserId(userId, id);

    try {
      return await this.executeWithAuth(
        async () => {
          return this.executeWithRateLimit(async () => {
            timer?.startPhase("network");
            console.log(`[${id}] GET ${this.baseUrl}/users/${validatedUserId}`);

            const requestSize = this.calculateHeadersSize({
              ...this.defaultHeaders,
              "X-Correlation-ID": id,
              ...this.getAuthHeaders(id),
              ...this.getRateLimitHeaders(),
            });

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

            timer?.endPhase("network");
            timer?.startPhase("validation");

            if (!response.ok) {
              console.error(
                `[${id}] HTTP ${response.status}: ${response.statusText}`
              );
              throw new Error(
                `HTTP ${response.status}: ${response.statusText}`
              );
            }

            console.log(`[${id}] Response received: ${response.status}`);
            const rawData = await this.parseResponse<unknown>(response);

            // Validate response data
            const result = UserValidator.validateUser(rawData, id);
            timer?.endPhase("validation");

            // Log performance metrics
            this.logPerformanceMetrics(
              timer,
              id,
              "GET",
              `${this.baseUrl}/users/${validatedUserId}`,
              response.status,
              requestSize,
              this.calculateResponseSize(result)
            );

            return result;
          }, id);
        },
        id,
        ["user"],
        timer
      );
    } catch (error) {
      this.logPerformanceMetrics(
        timer,
        id,
        "GET",
        `${this.baseUrl}/users/${validatedUserId}`,
        undefined,
        undefined,
        undefined,
        error
      );
      throw error;
    }
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
    const timer = this.performanceMonitor?.createTimer();

    // Validate input data
    const validatedUserData = UserValidator.validateCreateUserData(
      userData,
      id
    );

    try {
      return await this.executeWithAuth(
        async () => {
          return this.executeWithRateLimit(async () => {
            timer?.startPhase("network");
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

            const requestBody = JSON.stringify(validatedUserData);
            const requestSize =
              this.calculateHeadersSize(headers) +
              Buffer.byteLength(requestBody, "utf8");

            const response = await fetch(`${this.baseUrl}/users`, {
              method: "POST",
              headers,
              credentials: this.corsOptions.credentials,
              body: requestBody,
            });

            timer?.endPhase("network");
            timer?.startPhase("validation");

            if (!response.ok) {
              console.error(
                `[${id}] HTTP ${response.status}: ${response.statusText}`
              );
              throw new Error(
                `HTTP ${response.status}: ${response.statusText}`
              );
            }

            console.log(`[${id}] Response received: ${response.status}`);
            const rawData = await this.parseResponse<unknown>(response);

            // Validate response data
            const result = UserValidator.validateUser(rawData, id);
            timer?.endPhase("validation");

            // Log performance metrics
            this.logPerformanceMetrics(
              timer,
              id,
              "POST",
              `${this.baseUrl}/users`,
              response.status,
              requestSize,
              this.calculateResponseSize(result)
            );

            return result;
          }, id);
        },
        id,
        ["user"],
        timer
      );
    } catch (error) {
      this.logPerformanceMetrics(
        timer,
        id,
        "POST",
        `${this.baseUrl}/users`,
        undefined,
        undefined,
        undefined,
        error
      );
      throw error;
    }
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
    const timer = this.performanceMonitor?.createTimer();

    // Validate input parameters
    const validatedUserId = UserValidator.validateUserId(userId, id);
    const validatedUserData = UserValidator.validateUpdateUserData(
      userData,
      id
    );

    try {
      return await this.executeWithAuth(
        async () => {
          return this.executeWithRateLimit(async () => {
            timer?.startPhase("network");
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

            const requestBody = JSON.stringify(validatedUserData);
            const requestSize =
              this.calculateHeadersSize(headers) +
              Buffer.byteLength(requestBody, "utf8");

            const response = await fetch(
              `${this.baseUrl}/users/${validatedUserId}`,
              {
                method: "PUT",
                headers,
                credentials: this.corsOptions.credentials,
                body: requestBody,
              }
            );

            timer?.endPhase("network");
            timer?.startPhase("validation");

            if (!response.ok) {
              console.error(
                `[${id}] HTTP ${response.status}: ${response.statusText}`
              );
              throw new Error(
                `HTTP ${response.status}: ${response.statusText}`
              );
            }

            console.log(`[${id}] Response received: ${response.status}`);
            const rawData = await this.parseResponse<unknown>(response);

            // Validate response data
            const result = UserValidator.validateUser(rawData, id);
            timer?.endPhase("validation");

            // Log performance metrics
            this.logPerformanceMetrics(
              timer,
              id,
              "PUT",
              `${this.baseUrl}/users/${validatedUserId}`,
              response.status,
              requestSize,
              this.calculateResponseSize(result)
            );

            return result;
          }, id);
        },
        id,
        ["user"],
        timer
      );
    } catch (error) {
      this.logPerformanceMetrics(
        timer,
        id,
        "PUT",
        `${this.baseUrl}/users/${validatedUserId}`,
        undefined,
        undefined,
        undefined,
        error
      );
      throw error;
    }
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
    const timer = this.performanceMonitor?.createTimer();

    // Validate input parameters
    const validatedUserId = UserValidator.validateUserId(userId, id);
    const validatedUserData = UserValidator.validateUpdateUserData(
      userData,
      id
    );

    try {
      return await this.executeWithAuth(
        async () => {
          return this.executeWithRateLimit(async () => {
            timer?.startPhase("network");
            console.log(
              `[${id}] PATCH ${this.baseUrl}/users/${validatedUserId}`
            );

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

            const requestBody = JSON.stringify(validatedUserData);
            const requestSize =
              this.calculateHeadersSize(headers) +
              Buffer.byteLength(requestBody, "utf8");

            const response = await fetch(
              `${this.baseUrl}/users/${validatedUserId}`,
              {
                method: "PATCH",
                headers,
                credentials: this.corsOptions.credentials,
                body: requestBody,
              }
            );

            timer?.endPhase("network");
            timer?.startPhase("validation");

            if (!response.ok) {
              console.error(
                `[${id}] HTTP ${response.status}: ${response.statusText}`
              );
              throw new Error(
                `HTTP ${response.status}: ${response.statusText}`
              );
            }

            console.log(`[${id}] Response received: ${response.status}`);
            const rawData = await this.parseResponse<unknown>(response);

            // Validate response data
            const result = UserValidator.validateUser(rawData, id);
            timer?.endPhase("validation");

            // Log performance metrics
            this.logPerformanceMetrics(
              timer,
              id,
              "PATCH",
              `${this.baseUrl}/users/${validatedUserId}`,
              response.status,
              requestSize,
              this.calculateResponseSize(result)
            );

            return result;
          }, id);
        },
        id,
        ["user"],
        timer
      );
    } catch (error) {
      this.logPerformanceMetrics(
        timer,
        id,
        "PATCH",
        `${this.baseUrl}/users/${validatedUserId}`,
        undefined,
        undefined,
        undefined,
        error
      );
      throw error;
    }
  }

  /**
   * Delete user by ID (requires admin role)
   */
  async deleteUser(userId: number, correlationId?: string): Promise<void> {
    const id = correlationId || randomUUID();
    const timer = this.performanceMonitor?.createTimer();

    // Validate input parameters
    const validatedUserId = UserValidator.validateUserId(userId, id);

    try {
      await this.executeWithAuth(
        async () => {
          return this.executeWithRateLimit(async () => {
            timer?.startPhase("network");
            console.log(
              `[${id}] DELETE ${this.baseUrl}/users/${validatedUserId}`
            );

            const requestSize = this.calculateHeadersSize({
              ...this.defaultHeaders,
              "X-Correlation-ID": id,
              ...this.getAuthHeaders(id),
              ...this.getRateLimitHeaders(),
            });

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

            timer?.endPhase("network");

            if (!response.ok) {
              console.error(
                `[${id}] HTTP ${response.status}: ${response.statusText}`
              );
              throw new Error(
                `HTTP ${response.status}: ${response.statusText}`
              );
            }

            console.log(`[${id}] Response received: ${response.status}`);

            // Log performance metrics
            this.logPerformanceMetrics(
              timer,
              id,
              "DELETE",
              `${this.baseUrl}/users/${validatedUserId}`,
              response.status,
              requestSize,
              0
            );
          }, id);
        },
        id,
        ["admin"],
        timer
      ); // Delete requires admin role
    } catch (error) {
      this.logPerformanceMetrics(
        timer,
        id,
        "DELETE",
        `${this.baseUrl}/users/${validatedUserId}`,
        undefined,
        undefined,
        undefined,
        error
      );
      throw error;
    }
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
   * Set performance monitor
   */
  public setPerformanceMonitor(performanceMonitor: PerformanceMonitor): void {
    this.performanceMonitor = performanceMonitor;
  }

  /**
   * Execute function with authentication and authorization checks
   */
  private async executeWithAuth<T>(
    fn: () => Promise<T>,
    correlationId: string,
    requiredRoles: string[] = ["user"],
    timer?: PerformanceTimer
  ): Promise<T> {
    if (this.authService) {
      timer?.startPhase("auth");
      // Fail-fast: Validate session and check authorization
      this.authService.validateSession(correlationId);
      this.authService.checkAuthorization(requiredRoles, correlationId);
      timer?.endPhase("auth");
    }
    return fn();
  }

  /**
   * Execute function with rate limiting if enabled
   */
  private async executeWithRateLimit<T>(
    fn: () => Promise<T>,
    correlationId: string,
    timer?: PerformanceTimer
  ): Promise<T> {
    if (this.rateLimiter) {
      timer?.startPhase("rateLimit");
      const result = await this.rateLimiter.execute(fn, correlationId);
      timer?.endPhase("rateLimit");
      return result;
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

  /**
   * Log performance metrics if performance monitor is enabled
   */
  private logPerformanceMetrics(
    timer: PerformanceTimer | undefined,
    correlationId: string,
    method: string,
    url: string,
    statusCode?: number,
    requestSize?: number,
    responseSize?: number,
    error?: unknown
  ): void {
    if (!this.performanceMonitor || !timer) {
      return;
    }

    const session = this.authService?.getCurrentSession();
    const rateLimitStatus = this.rateLimiter?.getStatus();

    const metrics = this.performanceMonitor.createMetrics(
      timer,
      correlationId,
      method,
      url,
      statusCode,
      error instanceof Error ? error.message : String(error),
      {
        requestSize,
        responseSize,
        userId: session?.userId,
        username: session?.username,
        userRoles: session?.roles,
        rateLimitTokens: rateLimitStatus?.tokensRemaining,
        wasRateLimited: rateLimitStatus ? !rateLimitStatus.allowed : false,
        errorType: error instanceof Error ? error.constructor.name : undefined,
      }
    );

    this.performanceMonitor.logMetrics(metrics);
  }

  /**
   * Calculate approximate size of headers in bytes
   */
  private calculateHeadersSize(headers: Record<string, string>): number {
    return Object.entries(headers).reduce((total, [key, value]) => {
      return total + Buffer.byteLength(`${key}: ${value}\r\n`, "utf8");
    }, 0);
  }

  /**
   * Calculate approximate size of response data in bytes
   */
  private calculateResponseSize(data: unknown): number {
    try {
      return Buffer.byteLength(JSON.stringify(data), "utf8");
    } catch {
      return 0;
    }
  }

  /**
   * Parse response data from fetch API
   */
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
