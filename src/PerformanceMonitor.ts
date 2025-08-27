/**
 * Performance Monitoring and Event Logging Service
 * Tracks request/response metrics with structured logging to git-ignored files
 */

import { writeFileSync, appendFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Performance metrics for a request
 */
export interface PerformanceMetrics {
  /** Unique correlation ID for the request */
  correlationId: string;
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Request URL */
  url: string;
  /** HTTP status code */
  statusCode?: number;
  /** Total request duration in milliseconds */
  duration: number;
  /** Time to first byte in milliseconds */
  ttfb?: number;
  /** Request payload size in bytes */
  requestSize?: number;
  /** Response payload size in bytes */
  responseSize?: number;
  /** Authentication time in milliseconds */
  authTime?: number;
  /** Rate limiting check time in milliseconds */
  rateLimitTime?: number;
  /** Validation time in milliseconds */
  validationTime?: number;
  /** Network time in milliseconds */
  networkTime?: number;
  /** User ID if authenticated */
  userId?: string;
  /** Username if authenticated */
  username?: string;
  /** User roles if authenticated */
  userRoles?: string[];
  /** Rate limit tokens remaining */
  rateLimitTokens?: number;
  /** Whether request was rate limited */
  wasRateLimited?: boolean;
  /** Error message if request failed */
  error?: string;
  /** Error type/code if request failed */
  errorType?: string;
  /** Timestamp when request started */
  timestamp: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Performance monitoring configuration
 */
export interface PerformanceConfig {
  /** Enable performance monitoring */
  enabled?: boolean;
  /** Log file path (relative to project root) */
  logFile?: string;
  /** Enable console logging of performance metrics */
  consoleLogging?: boolean;
  /** Minimum duration (ms) to log (filters out very fast requests) */
  minDurationMs?: number;
  /** Maximum log file size in MB before rotation */
  maxLogSizeMB?: number;
  /** Include request/response payloads in logs */
  includePayloads?: boolean;
}

/**
 * Performance timer for measuring request phases
 */
export class PerformanceTimer {
  private startTime: number;
  private phases: Map<string, { start: number; end?: number }> = new Map();

  constructor() {
    this.startTime = performance.now();
  }

  /**
   * Start timing a specific phase
   */
  startPhase(phase: string): void {
    this.phases.set(phase, { start: performance.now() });
  }

  /**
   * End timing a specific phase
   */
  endPhase(phase: string): number {
    const phaseData = this.phases.get(phase);
    if (!phaseData) {
      return 0;
    }

    phaseData.end = performance.now();
    return phaseData.end - phaseData.start;
  }

  /**
   * Get duration of a specific phase
   */
  getPhaseDuration(phase: string): number {
    const phaseData = this.phases.get(phase);
    if (!phaseData || !phaseData.end) {
      return 0;
    }
    return phaseData.end - phaseData.start;
  }

  /**
   * Get total elapsed time since timer creation
   */
  getTotalDuration(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Get all phase durations
   */
  getAllPhases(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [phase, data] of this.phases) {
      if (data.end) {
        result[phase] = data.end - data.start;
      }
    }
    return result;
  }
}

/**
 * Performance monitoring service
 */
export class PerformanceMonitor {
  private config: Required<PerformanceConfig>;
  private logFilePath: string;

  constructor(config: PerformanceConfig = {}) {
    this.config = {
      enabled: true,
      logFile: "performance.log",
      consoleLogging: false,
      minDurationMs: 0,
      maxLogSizeMB: 100,
      includePayloads: false,
      ...config,
    };

    this.logFilePath = join(process.cwd(), this.config.logFile);
    this.initializeLogFile();
  }

  /**
   * Create a new performance timer
   */
  createTimer(): PerformanceTimer {
    return new PerformanceTimer();
  }

  /**
   * Log performance metrics for a request
   */
  logMetrics(metrics: PerformanceMetrics): void {
    if (!this.config.enabled) {
      return;
    }

    // Filter out requests below minimum duration
    if (metrics.duration < this.config.minDurationMs) {
      return;
    }

    const logEntry = {
      timestamp: metrics.timestamp,
      correlationId: metrics.correlationId,
      method: metrics.method,
      url: metrics.url,
      statusCode: metrics.statusCode,
      duration: Math.round(metrics.duration * 100) / 100, // Round to 2 decimal places
      ttfb: metrics.ttfb ? Math.round(metrics.ttfb * 100) / 100 : undefined,
      requestSize: metrics.requestSize,
      responseSize: metrics.responseSize,
      performance: {
        auth: metrics.authTime
          ? Math.round(metrics.authTime * 100) / 100
          : undefined,
        rateLimit: metrics.rateLimitTime
          ? Math.round(metrics.rateLimitTime * 100) / 100
          : undefined,
        validation: metrics.validationTime
          ? Math.round(metrics.validationTime * 100) / 100
          : undefined,
        network: metrics.networkTime
          ? Math.round(metrics.networkTime * 100) / 100
          : undefined,
      },
      auth: {
        userId: metrics.userId,
        username: metrics.username,
        roles: metrics.userRoles,
      },
      rateLimit: {
        tokensRemaining: metrics.rateLimitTokens,
        wasLimited: metrics.wasRateLimited,
      },
      error: metrics.error
        ? {
            message: metrics.error,
            type: metrics.errorType,
          }
        : undefined,
      metadata: metrics.metadata,
    };

    // Remove undefined values for cleaner logs
    const cleanedEntry = this.removeUndefined(logEntry);

    // Write to log file
    this.writeToLogFile(cleanedEntry);

    // Console logging if enabled
    if (this.config.consoleLogging) {
      console.log(
        `[PERF] ${metrics.correlationId} ${metrics.method} ${metrics.url} - ${
          metrics.duration
        }ms (${metrics.statusCode || "ERROR"})`
      );
    }
  }

  /**
   * Log a simple performance event
   */
  logEvent(
    correlationId: string,
    method: string,
    url: string,
    duration: number,
    statusCode?: number,
    error?: string
  ): void {
    this.logMetrics({
      correlationId,
      method,
      url,
      duration,
      statusCode,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Create performance metrics from timer and request data
   */
  createMetrics(
    timer: PerformanceTimer,
    correlationId: string,
    method: string,
    url: string,
    statusCode?: number,
    error?: string,
    additionalData?: Partial<PerformanceMetrics>
  ): PerformanceMetrics {
    const phases = timer.getAllPhases();

    return {
      correlationId,
      method,
      url,
      statusCode,
      duration: timer.getTotalDuration(),
      authTime: phases.auth,
      rateLimitTime: phases.rateLimit,
      validationTime: phases.validation,
      networkTime: phases.network,
      ttfb: phases.ttfb,
      error,
      timestamp: new Date().toISOString(),
      ...additionalData,
    };
  }

  /**
   * Get performance statistics from recent logs
   */
  getStats(lastNRequests: number = 100): {
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    errorRate: number;
    requestCount: number;
    p95Duration: number;
    p99Duration: number;
  } {
    // This is a simplified implementation
    // In production, you'd want to parse the log file or use a time-series database
    return {
      avgDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      errorRate: 0,
      requestCount: 0,
      p95Duration: 0,
      p99Duration: 0,
    };
  }

  /**
   * Initialize log file with header if it doesn't exist
   */
  private initializeLogFile(): void {
    if (!existsSync(this.logFilePath)) {
      const header = {
        logVersion: "1.0",
        createdAt: new Date().toISOString(),
        description: "Performance monitoring log for API requests",
        format: "JSONL (JSON Lines)",
      };

      writeFileSync(this.logFilePath, JSON.stringify(header) + "\n", "utf8");
    }
  }

  /**
   * Write log entry to file
   */
  private writeToLogFile(entry: unknown): void {
    try {
      const logLine = JSON.stringify(entry) + "\n";
      appendFileSync(this.logFilePath, logLine, "utf8");
    } catch (error) {
      console.error("Failed to write to performance log:", error);
    }
  }

  /**
   * Remove undefined values from object recursively
   */
  private removeUndefined(obj: any): any {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeUndefined(item));
    }

    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = this.removeUndefined(value);
      }
    }

    return cleaned;
  }
}

/**
 * Factory for creating performance monitors with common configurations
 */
export class PerformanceMonitorFactory {
  /**
   * Create development performance monitor with console logging
   */
  static createDevelopment(): PerformanceMonitor {
    return new PerformanceMonitor({
      enabled: true,
      logFile: "performance-dev.log",
      consoleLogging: true,
      minDurationMs: 0,
      includePayloads: true,
    });
  }

  /**
   * Create production performance monitor with minimal logging
   */
  static createProduction(): PerformanceMonitor {
    return new PerformanceMonitor({
      enabled: true,
      logFile: "performance-prod.log",
      consoleLogging: false,
      minDurationMs: 10, // Only log requests > 10ms
      includePayloads: false,
    });
  }

  /**
   * Create performance monitor for testing with detailed metrics
   */
  static createTesting(): PerformanceMonitor {
    return new PerformanceMonitor({
      enabled: true,
      logFile: "performance-test.log",
      consoleLogging: true,
      minDurationMs: 0,
      includePayloads: true,
    });
  }

  /**
   * Create disabled performance monitor (no-op)
   */
  static createDisabled(): PerformanceMonitor {
    return new PerformanceMonitor({
      enabled: false,
    });
  }
}
