/**
 * Rate Limiting Service
 * Implements token bucket algorithm with configurable limits and retry logic
 */

/**
 * Rate limit configuration options
 */
export interface RateLimitOptions {
  /** Maximum number of requests per window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Enable automatic retry on rate limit hit */
  enableRetry?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Base delay between retries in milliseconds */
  retryDelayMs?: number;
  /** Use exponential backoff for retries */
  exponentialBackoff?: boolean;
}

/**
 * Rate limit status information
 */
export interface RateLimitStatus {
  /** Current number of available tokens */
  tokensRemaining: number;
  /** Maximum tokens in bucket */
  maxTokens: number;
  /** Time until next token refill (ms) */
  resetTime: number;
  /** Whether request is allowed */
  allowed: boolean;
  /** Retry after time in seconds (if rate limited) */
  retryAfter?: number;
}

/**
 * Rate limit error for when limits are exceeded
 */
export class RateLimitError extends Error {
  public readonly retryAfter: number;
  public readonly tokensRemaining: number;
  public readonly correlationId?: string;

  constructor(
    message: string,
    retryAfter: number,
    tokensRemaining: number,
    correlationId?: string
  ) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
    this.tokensRemaining = tokensRemaining;
    this.correlationId = correlationId;
  }
}

/**
 * Token bucket rate limiter implementation
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly options: Required<RateLimitOptions>;

  constructor(options: RateLimitOptions) {
    this.options = {
      enableRetry: false,
      maxRetries: 3,
      retryDelayMs: 1000,
      exponentialBackoff: true,
      ...options,
    };

    this.tokens = this.options.maxRequests;
    this.lastRefill = Date.now();

    console.log(
      `[RateLimiter] Initialized with ${this.options.maxRequests} requests per ${this.options.windowMs}ms`
    );
  }

  /**
   * Check if request is allowed and consume token if available
   */
  public checkLimit(correlationId?: string): RateLimitStatus {
    const id = correlationId || "rate-limit";
    this.refillTokens();

    const status: RateLimitStatus = {
      tokensRemaining: this.tokens,
      maxTokens: this.options.maxRequests,
      resetTime: this.getResetTime(),
      allowed: this.tokens > 0,
    };

    if (this.tokens > 0) {
      this.tokens--;
      console.log(
        `[${id}] Rate limit check: ALLOWED (${this.tokens} tokens remaining)`
      );
      status.tokensRemaining = this.tokens;
    } else {
      const retryAfter = Math.ceil(this.getResetTime() / 1000);
      status.retryAfter = retryAfter;
      console.warn(`[${id}] Rate limit exceeded. Retry after ${retryAfter}s`);
    }

    return status;
  }

  /**
   * Execute a function with rate limiting and optional retry logic
   */
  public async execute<T>(
    fn: () => Promise<T>,
    correlationId?: string
  ): Promise<T> {
    const id = correlationId || "rate-limit";
    let attempts = 0;

    while (attempts <= this.options.maxRetries) {
      const status = this.checkLimit(id);

      if (status.allowed) {
        try {
          return await fn();
        } catch (error) {
          // If it's not a rate limit error, don't retry
          if (!(error instanceof RateLimitError)) {
            throw error;
          }
          // Fall through to retry logic for rate limit errors
        }
      }

      if (!this.options.enableRetry || attempts >= this.options.maxRetries) {
        throw new RateLimitError(
          `Rate limit exceeded. ${status.tokensRemaining} requests remaining. Retry after ${status.retryAfter}s`,
          status.retryAfter || 0,
          status.tokensRemaining,
          id
        );
      }

      attempts++;
      const delay = this.calculateRetryDelay(attempts);
      console.log(
        `[${id}] Rate limited. Retrying in ${delay}ms (attempt ${attempts}/${this.options.maxRetries})`
      );

      await this.sleep(delay);
    }

    throw new RateLimitError(
      `Rate limit exceeded after ${this.options.maxRetries} retries`,
      0,
      0,
      id
    );
  }

  /**
   * Get rate limit headers for HTTP responses
   */
  public getHeaders(): Record<string, string> {
    this.refillTokens();

    return {
      "X-RateLimit-Limit": this.options.maxRequests.toString(),
      "X-RateLimit-Remaining": this.tokens.toString(),
      "X-RateLimit-Reset": Math.ceil(
        (Date.now() + this.getResetTime()) / 1000
      ).toString(),
      "X-RateLimit-Window": this.options.windowMs.toString(),
    };
  }

  /**
   * Reset rate limiter (useful for testing)
   */
  public reset(): void {
    this.tokens = this.options.maxRequests;
    this.lastRefill = Date.now();
    console.log("[RateLimiter] Reset to full capacity");
  }

  /**
   * Get current rate limit status without consuming tokens
   */
  public getStatus(): RateLimitStatus {
    this.refillTokens();

    return {
      tokensRemaining: this.tokens,
      maxTokens: this.options.maxRequests,
      resetTime: this.getResetTime(),
      allowed: this.tokens > 0,
      retryAfter:
        this.tokens > 0 ? undefined : Math.ceil(this.getResetTime() / 1000),
    };
  }

  /**
   * Refill tokens based on elapsed time (token bucket algorithm)
   */
  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;

    if (timePassed >= this.options.windowMs) {
      // Full refill after complete window
      const windowsPassed = Math.floor(timePassed / this.options.windowMs);
      this.tokens = Math.min(
        this.options.maxRequests,
        this.tokens + windowsPassed * this.options.maxRequests
      );
      this.lastRefill = now;
    }
  }

  /**
   * Calculate time until next token refill
   */
  private getResetTime(): number {
    const timePassed = Date.now() - this.lastRefill;
    return Math.max(0, this.options.windowMs - timePassed);
  }

  /**
   * Calculate retry delay with optional exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    if (this.options.exponentialBackoff) {
      return this.options.retryDelayMs * Math.pow(2, attempt - 1);
    }
    return this.options.retryDelayMs;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create common rate limiter configurations
 */
export class RateLimiterFactory {
  /**
   * Create a conservative rate limiter (60 requests per minute)
   */
  static createConservative(): RateLimiter {
    return new RateLimiter({
      maxRequests: 60,
      windowMs: 60 * 1000, // 1 minute
      enableRetry: true,
      maxRetries: 3,
      retryDelayMs: 1000,
      exponentialBackoff: true,
    });
  }

  /**
   * Create a moderate rate limiter (100 requests per minute)
   */
  static createModerate(): RateLimiter {
    return new RateLimiter({
      maxRequests: 100,
      windowMs: 60 * 1000, // 1 minute
      enableRetry: true,
      maxRetries: 2,
      retryDelayMs: 500,
      exponentialBackoff: true,
    });
  }

  /**
   * Create an aggressive rate limiter (300 requests per minute)
   */
  static createAggressive(): RateLimiter {
    return new RateLimiter({
      maxRequests: 300,
      windowMs: 60 * 1000, // 1 minute
      enableRetry: false,
    });
  }

  /**
   * Create a burst-friendly rate limiter (10 requests per second)
   */
  static createBurstFriendly(): RateLimiter {
    return new RateLimiter({
      maxRequests: 10,
      windowMs: 1000, // 1 second
      enableRetry: true,
      maxRetries: 5,
      retryDelayMs: 200,
      exponentialBackoff: false,
    });
  }
}
