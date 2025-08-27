import { randomUUID } from "crypto";
import { UserValidator } from "./UserValidator.js";
import { RateLimiter, RateLimitOptions } from "./RateLimiter.js";
import { AuthService } from './AuthService';
import { PerformanceMonitor, PerformanceTimer } from "./PerformanceMonitor.js";
import { ApiVersioningService } from "./ApiVersioning.js";
import { CircuitBreaker, CircuitBreakerFactory } from "./CircuitBreaker.js";
import { CacheManager, CacheFactory } from "./CacheManager.js";
import { HealthCheckService, HealthCheckFactory, SystemHealth } from "./HealthCheck.js";

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
  private versioningService?: ApiVersioningService;
  private circuitBreaker?: CircuitBreaker;
  private cache: CacheManager<any>;
  private healthCheckService: HealthCheckService;

  constructor(
    baseUrl: string,
    defaultHeaders: Record<string, string> = {},
    corsOptions: CorsOptions = {},
    idempotencyOptions: IdempotencyOptions = {},
    rateLimitOptions?: RateLimitOptions,
    authService?: AuthService,
    performanceMonitor?: PerformanceMonitor,
    versioningService?: ApiVersioningService,
    circuitBreaker?: CircuitBreaker,
    cache?: CacheManager<any>
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
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

    // Set versioning service
    this.versioningService = versioningService;

    // Set circuit breaker or create default one
    this.circuitBreaker =
      circuitBreaker ||
      CircuitBreakerFactory.createApiCircuitBreaker("UsersApi");

    // Set cache
    this.cache = cache || CacheFactory.createApiCache<any>('users-api');

    // Initialize health check service
    this.healthCheckService = HealthCheckFactory.createDevelopmentHealthCheck(this.cache);
  }

  /**
   * Get all users
   */
  async getUsers(correlationId?: string): Promise<User[]> {
    const id = correlationId || randomUUID();
    const timer = this.performanceMonitor?.createTimer();

    const cacheKey = this.generateCacheKey("GET", "/users");
    const cached = await this.checkCache<User[]>(cacheKey, id);
    if (cached) {
      return cached;
    }

    try {
      return await this.executeWithAuth(
        async () => {
          return this.executeWithRateLimit(async () => {
            timer?.startPhase("network");
            const url = this.buildVersionedUrl("/users");
            console.log(`[${id}] GET ${url}`);

            const requestSize = this.calculateHeadersSize({
              ...this.defaultHeaders,
              "X-Correlation-ID": id,
              ...this.getAuthHeaders(id),
              ...this.getRateLimitHeaders(),
            });

            const response = await fetch(url, {
              method: "GET",
              headers: this.addVersionHeaders({
                ...this.defaultHeaders,
                "X-Correlation-ID": id,
                ...this.getAuthHeaders(id),
                ...this.getRateLimitHeaders(),
              }),
              credentials: this.corsOptions.credentials,
            });

            timer?.endPhase("network");
            timer?.startPhase("validation");

            this.handleVersionResponse(response);

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
              url,
              response.status,
              requestSize,
              this.calculateResponseSize(result)
            );

            // Cache result
            this.cacheResponse(cacheKey, result, this.getCacheTags(), id);

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
        this.buildVersionedUrl("/users"),
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

    const cacheKey = this.generateCacheKey("GET", `/users/${validatedUserId}`);
    const cached = await this.checkCache<User>(cacheKey, id);
    if (cached) {
      return cached;
    }

    try {
      return await this.executeWithAuth(
        async () => {
          return this.executeWithRateLimit(async () => {
            timer?.startPhase("network");
            const url = this.buildVersionedUrl(`/users/${validatedUserId}`);
            console.log(`[${id}] GET ${url}`);

            const requestSize = this.calculateHeadersSize({
              ...this.defaultHeaders,
              "X-Correlation-ID": id,
              ...this.getAuthHeaders(id),
              ...this.getRateLimitHeaders(),
            });

            const response = await fetch(url, {
              method: "GET",
              headers: this.addVersionHeaders({
                ...this.defaultHeaders,
                "X-Correlation-ID": id,
                ...this.getAuthHeaders(id),
                ...this.getRateLimitHeaders(),
              }),
              credentials: this.corsOptions.credentials,
            });

            timer?.endPhase("network");
            timer?.startPhase("validation");

            this.handleVersionResponse(response);

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
              url,
              response.status,
              requestSize,
              this.calculateResponseSize(result)
            );

            // Cache result
            this.cacheResponse(
              cacheKey,
              result,
              this.getCacheTags(validatedUserId),
              id
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
        this.buildVersionedUrl(`/users/${validatedUserId}`),
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
            const url = this.buildVersionedUrl("/users");
            console.log(`[${id}] POST ${url}`);

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

            const response = await fetch(url, {
              method: "POST",
              headers: this.addVersionHeaders(headers),
              credentials: this.corsOptions.credentials,
              body: requestBody,
            });

            timer?.endPhase("network");
            timer?.startPhase("validation");

            this.handleVersionResponse(response);

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
              url,
              response.status,
              requestSize,
              this.calculateResponseSize(result)
            );

            // Invalidate cache
            this.invalidateCache(this.getCacheTags(), id);

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
        this.buildVersionedUrl("/users"),
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
            const url = this.buildVersionedUrl(`/users/${validatedUserId}`);
            console.log(`[${id}] PUT ${url}`);

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

            const response = await fetch(url, {
              method: "PUT",
              headers: this.addVersionHeaders(headers),
              credentials: this.corsOptions.credentials,
              body: requestBody,
            });

            timer?.endPhase("network");
            timer?.startPhase("validation");

            this.handleVersionResponse(response);

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
              url,
              response.status,
              requestSize,
              this.calculateResponseSize(result)
            );

            // Invalidate cache
            this.invalidateCache(this.getCacheTags(validatedUserId), id);

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
        this.buildVersionedUrl(`/users/${validatedUserId}`),
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
            const url = this.buildVersionedUrl(`/users/${validatedUserId}`);
            console.log(`[${id}] PATCH ${url}`);

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

            const response = await fetch(url, {
              method: "PATCH",
              headers: this.addVersionHeaders(headers),
              credentials: this.corsOptions.credentials,
              body: requestBody,
            });

            timer?.endPhase("network");
            timer?.startPhase("validation");

            this.handleVersionResponse(response);

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
              url,
              response.status,
              requestSize,
              this.calculateResponseSize(result)
            );

            // Invalidate cache
            this.invalidateCache(this.getCacheTags(validatedUserId), id);

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
        this.buildVersionedUrl(`/users/${validatedUserId}`),
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
            const url = this.buildVersionedUrl(`/users/${validatedUserId}`);
            console.log(`[${id}] DELETE ${url}`);

            const requestSize = this.calculateHeadersSize({
              ...this.defaultHeaders,
              "X-Correlation-ID": id,
              ...this.getAuthHeaders(id),
              ...this.getRateLimitHeaders(),
            });

            const response = await fetch(url, {
              method: "DELETE",
              headers: this.addVersionHeaders({
                ...this.defaultHeaders,
                "X-Correlation-ID": id,
                ...this.getAuthHeaders(id),
                ...this.getRateLimitHeaders(),
              }),
              credentials: this.corsOptions.credentials,
            });

            timer?.endPhase("network");

            this.handleVersionResponse(response);

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
              url,
              response.status,
              requestSize,
              0
            );

            // Invalidate cache
            this.invalidateCache(this.getCacheTags(validatedUserId), id);
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
        this.buildVersionedUrl(`/users/${validatedUserId}`),
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
   * Set versioning service
   */
  public setVersioningService(versioningService: ApiVersioningService): void {
    this.versioningService = versioningService;
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
   * Execute function with circuit breaker if enabled
   */
  private async executeWithCircuitBreaker<T>(
    fn: () => Promise<T>,
    correlationId: string,
    timer?: PerformanceTimer
  ): Promise<T> {
    if (this.circuitBreaker) {
      timer?.startPhase("circuitBreaker");
      const result = await this.circuitBreaker.execute(fn, correlationId);
      timer?.endPhase("circuitBreaker");
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

  /**
   * Build versioned URL
   */
  private buildVersionedUrl(endpoint: string): string {
    if (this.versioningService) {
      // Use negotiateVersion to get the proper version and URL
      const versionedRequest = this.versioningService.negotiateVersion(
        `${this.baseUrl}${endpoint}`,
        {},
        {}
      );
      return versionedRequest.url;
    }
    return `${this.baseUrl}${endpoint}`;
  }

  /**
   * Add version headers
   */
  private addVersionHeaders(
    headers: Record<string, string>
  ): Record<string, string> {
    if (this.versioningService) {
      // Use negotiateVersion to get the proper headers
      const versionedRequest = this.versioningService.negotiateVersion(
        `${this.baseUrl}/`,
        headers,
        {}
      );
      return { ...headers, ...versionedRequest.headers };
    }
    return headers;
  }

  /**
   * Handle version response
   */
  private handleVersionResponse(response: Response): void {
    if (this.versioningService) {
      // Check for deprecation warnings in response headers
      const deprecationWarning = response.headers.get("Deprecation");
      const sunsetHeader = response.headers.get("Sunset");
      const apiVersion = response.headers.get("API-Version");

      if (deprecationWarning) {
        console.warn(
          `⚠️  API Version Deprecation Warning: ${deprecationWarning}`
        );
      }

      if (sunsetHeader) {
        console.warn(`⚠️  API Version Sunset Date: ${sunsetHeader}`);
      }

      if (apiVersion) {
        console.log(`📋 API Version: ${apiVersion}`);
      }
    }
  }

  /**
   * Generate cache key for API requests
   */
  private generateCacheKey(
    method: string,
    endpoint: string,
    params?: any
  ): string {
    const baseKey = `${method}:${endpoint}`;
    if (params && Object.keys(params).length > 0) {
      const paramString = new URLSearchParams(params).toString();
      return `${baseKey}?${paramString}`;
    }
    return baseKey;
  }

  /**
   * Get cache tags for invalidation
   */
  private getCacheTags(userId?: string | number): string[] {
    const tags = ["users"];
    if (userId) {
      tags.push(`user:${userId}`);
    }
    return tags;
  }

  /**
   * Check cache for GET requests
   */
  private async checkCache<T>(
    cacheKey: string,
    correlationId: string
  ): Promise<T | null> {
    try {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.performanceMonitor?.logEvent(
          correlationId,
          "GET",
          cacheKey,
          0,
          200
        );
        return cached;
      }

      this.performanceMonitor?.logEvent(correlationId, "GET", cacheKey, 0, 404);
      return null;
    } catch (error) {
      this.performanceMonitor?.logEvent(
        correlationId,
        "GET",
        cacheKey,
        0,
        500,
        error instanceof Error ? error.message : "Unknown error"
      );
      return null;
    }
  }

  /**
   * Cache API response
   */
  private cacheResponse<T>(
    cacheKey: string,
    data: T,
    tags: string[],
    correlationId: string,
    ttl?: number
  ): void {
    try {
      this.cache.set(cacheKey, data, { ttl, tags });
      this.performanceMonitor?.logEvent(
        correlationId,
        "CACHE",
        cacheKey,
        0,
        200
      );
    } catch (error) {
      this.performanceMonitor?.logEvent(
        correlationId,
        "CACHE",
        cacheKey,
        0,
        500,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  /**
   * Invalidate cache entries
   */
  private invalidateCache(tags: string[], correlationId: string): void {
    try {
      this.cache.invalidateByTags(tags);
      this.performanceMonitor?.logEvent(
        correlationId,
        "CACHE",
        `invalidate:${tags.join(",")}`,
        0,
        200
      );
    } catch (error) {
      this.performanceMonitor?.logEvent(
        correlationId,
        "CACHE",
        `invalidate:${tags.join(",")}`,
        0,
        500,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  /**
   * Get cache metrics for monitoring
   */
  getCacheMetrics(): any {
    return this.cache.getMetrics();
  }

  /**
   * Get cache statistics summary
   */
  getCacheStats(): { [key: string]: any } {
    const metrics = this.cache.getMetrics();
    const totalRequests = metrics.hits + metrics.misses;
    const hitRate =
      totalRequests > 0
        ? (metrics.hits / totalRequests * 100).toFixed(2)
        : "0.00";

    return {
      name: "users-api-cache",
      hitRate: `${hitRate}%`,
      totalRequests,
      hits: metrics.hits,
      misses: metrics.misses,
      evictions: metrics.evictions,
      expirations: metrics.expirations,
      currentSize: metrics.size,
      maxSize: 1000, // Default from factory
      memoryUsage: `${(metrics.memoryUsage / 1024 / 1024).toFixed(2)} MB`,
    };
  }

  /**
   * Log cache performance metrics
   */
  private logCacheMetrics(correlationId: string): void {
    const stats = this.getCacheStats();
    this.performanceMonitor?.logEvent(
      correlationId,
      "CACHE",
      "metrics",
      0,
      200
    );
  }

  /**
   * Clear cache and log action
   */
  clearCache(correlationId?: string): void {
    const id = correlationId || randomUUID();
    const statsBefore = this.getCacheStats();

    this.cache.clear();

    this.performanceMonitor?.logEvent(id, "CACHE", "clear", 0, 200);
  }

  /**
   * Warm up cache with common requests
   */
  async warmupCache(correlationId?: string): Promise<void> {
    const id = correlationId || randomUUID();

    this.performanceMonitor?.logEvent(id, "CACHE", "warmup-start", 0, 200);

    try {
      // Warm up with users list
      await this.getUsers(id);

      this.performanceMonitor?.logEvent(id, "CACHE", "warmup-complete", 0, 200);
    } catch (error) {
      this.performanceMonitor?.logEvent(
        id,
        "CACHE",
        "warmup-failed",
        0,
        500,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  /**
   * Get comprehensive system health
   */
  async getHealth(correlationId?: string): Promise<SystemHealth> {
    const id = correlationId || randomUUID();
    
    this.performanceMonitor?.logEvent(
      id,
      "GET",
      "/health",
      0,
      200
    );

    return await this.healthCheckService.checkHealth();
  }

  /**
   * Check if system is ready (all critical components healthy)
   */
  async getHealthReady(correlationId?: string): Promise<{ ready: boolean; health: SystemHealth }> {
    const id = correlationId || randomUUID();
    const health = await this.healthCheckService.checkHealth();
    const ready = await this.healthCheckService.isReady();
    
    this.performanceMonitor?.logEvent(
      id,
      "GET",
      "/health/ready",
      0,
      ready ? 200 : 503
    );

    return { ready, health };
  }

  /**
   * Check if system is alive (basic liveness check)
   */
  async getHealthLive(correlationId?: string): Promise<{ alive: boolean; timestamp: string }> {
    const id = correlationId || randomUUID();
    const alive = await this.healthCheckService.isAlive();
    
    this.performanceMonitor?.logEvent(
      id,
      "GET",
      "/health/live",
      0,
      200
    );

    return { 
      alive, 
      timestamp: new Date().toISOString() 
    };
  }

  /**
   * Get last cached health check result
   */
  getHealthCached(): SystemHealth | undefined {
    return this.healthCheckService.getLastHealthCheck();
  }

  /**
   * Start periodic health checks
   */
  startHealthMonitoring(): void {
    this.healthCheckService.startPeriodicChecks();
  }

  /**
   * Stop periodic health checks
   */
  stopHealthMonitoring(): void {
    this.healthCheckService.stopPeriodicChecks();
  }
}
