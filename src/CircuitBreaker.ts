/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures and provides automatic recovery for external API calls
 */

export enum CircuitState {
  CLOSED = "CLOSED", // Normal operation
  OPEN = "OPEN", // Failing fast, not allowing requests
  HALF_OPEN = "HALF_OPEN", // Testing if service has recovered
}

export interface CircuitBreakerConfig {
  /** Failure threshold before opening circuit */
  failureThreshold: number;
  /** Success threshold to close circuit from half-open */
  successThreshold: number;
  /** Time in ms to wait before attempting recovery */
  timeout: number;
  /** Time window in ms for failure counting */
  monitoringPeriod: number;
  /** Custom error predicate to determine if error should trigger circuit */
  isFailure?: (error: Error) => boolean;
  /** Fallback function when circuit is open */
  fallback?: <T>() => Promise<T>;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
  uptime: number;
  failureRate: number;
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: CircuitState,
    public readonly metrics: CircuitBreakerMetrics
  ) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}

/**
 * Circuit Breaker implementation with comprehensive state management
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;
  private readonly startTime = new Date();
  private readonly failures: Date[] = [];

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {
    this.validateConfig();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    correlationId?: string
  ): Promise<T> {
    const id = correlationId || `cb-${Date.now()}`;
    this.totalRequests++;

    console.log(
      `[${id}] Circuit Breaker [${this.name}] - State: ${this.state}, Attempt: ${this.totalRequests}`
    );

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        console.log(
          `[${id}] Circuit Breaker [${this.name}] - Attempting reset to HALF_OPEN`
        );
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        const timeToRetry = this.nextAttemptTime
          ? this.nextAttemptTime.getTime() - Date.now()
          : 0;
        console.warn(
          `[${id}] Circuit Breaker [${this.name}] - OPEN: Fast failing. Retry in ${timeToRetry}ms`
        );

        if (this.config.fallback) {
          console.log(
            `[${id}] Circuit Breaker [${this.name}] - Executing fallback`
          );
          return this.config.fallback<T>();
        }

        throw new CircuitBreakerError(
          `Circuit breaker [${this.name}] is OPEN. Service unavailable.`,
          this.state,
          this.getMetrics()
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess(id);
      return result;
    } catch (error) {
      this.onFailure(error as Error, id);
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(correlationId: string): void {
    this.lastSuccessTime = new Date();
    this.successCount++;

    console.log(
      `[${correlationId}] Circuit Breaker [${this.name}] - SUCCESS: ${this.successCount}/${this.config.successThreshold}`
    );

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        console.log(
          `[${correlationId}] Circuit Breaker [${this.name}] - CLOSING: Success threshold reached`
        );
        this.reset();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
      this.cleanupOldFailures();
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error, correlationId: string): void {
    // Check if this error should trigger the circuit breaker
    if (this.config.isFailure && !this.config.isFailure(error)) {
      console.log(
        `[${correlationId}] Circuit Breaker [${this.name}] - Error ignored by predicate: ${error.message}`
      );
      return;
    }

    this.lastFailureTime = new Date();
    this.failureCount++;
    this.failures.push(this.lastFailureTime);

    console.warn(
      `[${correlationId}] Circuit Breaker [${this.name}] - FAILURE: ${this.failureCount}/${this.config.failureThreshold} - ${error.message}`
    );

    this.cleanupOldFailures();

    // Check if we should open the circuit
    if (
      this.state === CircuitState.CLOSED &&
      this.failureCount >= this.config.failureThreshold
    ) {
      this.openCircuit(correlationId);
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state should open the circuit
      console.warn(
        `[${correlationId}] Circuit Breaker [${this.name}] - HALF_OPEN failure: Opening circuit`
      );
      this.openCircuit(correlationId);
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(correlationId: string): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = new Date(Date.now() + this.config.timeout);

    console.error(
      `[${correlationId}] Circuit Breaker [${
        this.name
      }] - OPENED: Next attempt at ${this.nextAttemptTime.toISOString()}`
    );
  }

  /**
   * Reset circuit breaker to closed state
   */
  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = undefined;
    this.failures.length = 0;

    console.log(
      `Circuit Breaker [${this.name}] - RESET: Circuit closed and counters reset`
    );
  }

  /**
   * Check if we should attempt to reset from open state
   */
  private shouldAttemptReset(): boolean {
    return this.nextAttemptTime
      ? Date.now() >= this.nextAttemptTime.getTime()
      : false;
  }

  /**
   * Clean up old failures outside the monitoring period
   */
  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    const validFailures = this.failures.filter(
      (failure) => failure.getTime() > cutoff
    );

    if (validFailures.length !== this.failures.length) {
      this.failures.length = 0;
      this.failures.push(...validFailures);
      this.failureCount = this.failures.length;
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const now = Date.now();
    const uptime = now - this.startTime.getTime();
    const recentFailures = this.failures.filter(
      (f) => f.getTime() > now - this.config.monitoringPeriod
    );
    const failureRate =
      this.totalRequests > 0 ? recentFailures.length / this.totalRequests : 0;

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
      uptime,
      failureRate,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Force circuit breaker to open (for testing)
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = new Date(Date.now() + this.config.timeout);
    console.warn(`Circuit Breaker [${this.name}] - FORCED OPEN`);
  }

  /**
   * Force circuit breaker to close (for testing)
   */
  forceClose(): void {
    this.reset();
    console.log(`Circuit Breaker [${this.name}] - FORCED CLOSE`);
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (this.config.failureThreshold <= 0) {
      throw new Error("Failure threshold must be greater than 0");
    }
    if (this.config.successThreshold <= 0) {
      throw new Error("Success threshold must be greater than 0");
    }
    if (this.config.timeout <= 0) {
      throw new Error("Timeout must be greater than 0");
    }
    if (this.config.monitoringPeriod <= 0) {
      throw new Error("Monitoring period must be greater than 0");
    }
  }
}

/**
 * Factory for creating circuit breakers with common configurations
 */
export class CircuitBreakerFactory {
  /**
   * Create a circuit breaker for external API calls
   */
  static createApiCircuitBreaker(name: string): CircuitBreaker {
    return new CircuitBreaker(name, {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 60000, // 1 minute
      monitoringPeriod: 120000, // 2 minutes
      isFailure: (error: Error) => {
        // Only network errors and 5xx status codes should trigger circuit breaker
        return (
          error.message.includes("fetch") ||
          error.message.includes("HTTP 5") ||
          error.message.includes("timeout") ||
          error.message.includes("ECONNREFUSED")
        );
      },
      fallback: async <T>(): Promise<T> => {
        console.log(
          "🔄 Circuit Breaker Fallback: Returning cached or default data"
        );
        return [] as T; // Return empty array as fallback
      },
    });
  }

  /**
   * Create a circuit breaker for database operations
   */
  static createDatabaseCircuitBreaker(name: string): CircuitBreaker {
    return new CircuitBreaker(name, {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 30000, // 30 seconds
      monitoringPeriod: 60000, // 1 minute
      isFailure: (error: Error) => {
        return (
          error.message.includes("connection") ||
          error.message.includes("timeout") ||
          error.message.includes("ECONNREFUSED")
        );
      },
    });
  }

  /**
   * Create a circuit breaker for critical services
   */
  static createCriticalServiceCircuitBreaker(name: string): CircuitBreaker {
    return new CircuitBreaker(name, {
      failureThreshold: 2,
      successThreshold: 5,
      timeout: 120000, // 2 minutes
      monitoringPeriod: 300000, // 5 minutes
      isFailure: (error: Error) => true, // All errors trigger circuit breaker
    });
  }
}
