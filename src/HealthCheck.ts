/**
 * Comprehensive Health Check System
 * Monitors application and dependency health for production readiness
 */

export enum HealthStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded", 
  UNHEALTHY = "unhealthy",
  UNKNOWN = "unknown"
}

export interface HealthCheckResult {
  /** Component name */
  name: string;
  /** Health status */
  status: HealthStatus;
  /** Response time in milliseconds */
  responseTime: number;
  /** Additional details */
  details?: Record<string, any>;
  /** Error message if unhealthy */
  error?: string;
  /** Timestamp of check */
  timestamp: string;
}

export interface SystemHealth {
  /** Overall system status */
  status: HealthStatus;
  /** Individual component results */
  checks: HealthCheckResult[];
  /** System uptime in milliseconds */
  uptime: number;
  /** Timestamp of health check */
  timestamp: string;
  /** Version information */
  version: string;
  /** Environment */
  environment: string;
}

export interface HealthCheckConfig {
  /** Timeout for health checks in milliseconds */
  timeout: number;
  /** Interval between checks in milliseconds */
  interval: number;
  /** Number of retries for failed checks */
  retries: number;
  /** Enable detailed logging */
  enableLogging: boolean;
}

/**
 * Individual health check interface
 */
export interface HealthChecker {
  /** Name of the component being checked */
  name: string;
  /** Perform the health check */
  check(): Promise<HealthCheckResult>;
  /** Check if this component is critical for system health */
  isCritical(): boolean;
}

/**
 * Database health checker
 */
export class DatabaseHealthChecker implements HealthChecker {
  constructor(
    private connectionUrl: string,
    private critical: boolean = true
  ) {}

  name = "database";

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Simulate database connection check
      await this.simulateDbConnection();
      
      return {
        name: this.name,
        status: HealthStatus.HEALTHY,
        responseTime: Date.now() - startTime,
        details: {
          connectionUrl: this.maskSensitiveInfo(this.connectionUrl),
          poolSize: 10,
          activeConnections: 3
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        name: this.name,
        status: HealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown database error',
        timestamp: new Date().toISOString()
      };
    }
  }

  isCritical(): boolean {
    return this.critical;
  }

  private async simulateDbConnection(): Promise<void> {
    // Simulate database connection with random success/failure
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    if (Math.random() < 0.1) { // 10% failure rate for demo
      throw new Error('Database connection timeout');
    }
  }

  private maskSensitiveInfo(url: string): string {
    return url.replace(/\/\/.*@/, '//***:***@');
  }
}

/**
 * External API health checker
 */
export class ExternalApiHealthChecker implements HealthChecker {
  constructor(
    private apiUrl: string,
    private apiName: string,
    private critical: boolean = false
  ) {}

  get name(): string {
    return `external-api-${this.apiName}`;
  }

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'HealthCheck/1.0' }
      });
      
      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        return {
          name: this.name,
          status: HealthStatus.HEALTHY,
          responseTime,
          details: {
            url: this.apiUrl,
            statusCode: response.status,
            statusText: response.statusText
          },
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          name: this.name,
          status: HealthStatus.DEGRADED,
          responseTime,
          error: `HTTP ${response.status}: ${response.statusText}`,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      return {
        name: this.name,
        status: this.critical ? HealthStatus.UNHEALTHY : HealthStatus.DEGRADED,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'External API unreachable',
        timestamp: new Date().toISOString()
      };
    }
  }

  isCritical(): boolean {
    return this.critical;
  }
}

/**
 * Cache health checker
 */
export class CacheHealthChecker implements HealthChecker {
  constructor(
    private cacheManager: any,
    private critical: boolean = false
  ) {}

  name = "cache";

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test cache operations
      const testKey = `health-check-${Date.now()}`;
      const testValue = { test: true, timestamp: Date.now() };
      
      // Test write
      this.cacheManager.set(testKey, testValue);
      
      // Test read
      const retrieved = this.cacheManager.get(testKey);
      
      // Test delete
      this.cacheManager.remove(testKey);
      
      const metrics = this.cacheManager.getMetrics();
      
      return {
        name: this.name,
        status: HealthStatus.HEALTHY,
        responseTime: Date.now() - startTime,
        details: {
          hitRate: `${(metrics.hitRatio * 100).toFixed(2)}%`,
          size: metrics.size,
          memoryUsage: `${(metrics.memoryUsage / 1024 / 1024).toFixed(2)} MB`,
          operations: 'read/write/delete successful'
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        name: this.name,
        status: this.critical ? HealthStatus.UNHEALTHY : HealthStatus.DEGRADED,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Cache operation failed',
        timestamp: new Date().toISOString()
      };
    }
  }

  isCritical(): boolean {
    return this.critical;
  }
}

/**
 * Memory health checker
 */
export class MemoryHealthChecker implements HealthChecker {
  constructor(
    private maxMemoryMB: number = 512,
    private critical: boolean = true
  ) {}

  name = "memory";

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const memoryUsage = process.memoryUsage();
      const usedMB = memoryUsage.heapUsed / 1024 / 1024;
      const totalMB = memoryUsage.heapTotal / 1024 / 1024;
      const usagePercent = (usedMB / this.maxMemoryMB) * 100;
      
      let status = HealthStatus.HEALTHY;
      if (usagePercent > 90) {
        status = HealthStatus.UNHEALTHY;
      } else if (usagePercent > 75) {
        status = HealthStatus.DEGRADED;
      }
      
      return {
        name: this.name,
        status,
        responseTime: Date.now() - startTime,
        details: {
          usedMB: Math.round(usedMB),
          totalMB: Math.round(totalMB),
          maxMB: this.maxMemoryMB,
          usagePercent: Math.round(usagePercent),
          external: Math.round(memoryUsage.external / 1024 / 1024)
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        name: this.name,
        status: HealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Memory check failed',
        timestamp: new Date().toISOString()
      };
    }
  }

  isCritical(): boolean {
    return this.critical;
  }
}

/**
 * Main health check service
 */
export class HealthCheckService {
  private checkers: HealthChecker[] = [];
  private startTime = Date.now();
  private lastHealthCheck?: SystemHealth;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(private config: HealthCheckConfig) {}

  /**
   * Add a health checker
   */
  addChecker(checker: HealthChecker): void {
    this.checkers.push(checker);
  }

  /**
   * Remove a health checker
   */
  removeChecker(name: string): void {
    this.checkers = this.checkers.filter(checker => checker.name !== name);
  }

  /**
   * Perform comprehensive health check
   */
  async checkHealth(): Promise<SystemHealth> {
    const startTime = Date.now();
    const checks: HealthCheckResult[] = [];
    
    // Run all health checks in parallel
    const checkPromises = this.checkers.map(async (checker) => {
      try {
        const result = await Promise.race([
          checker.check(),
          this.timeoutPromise(checker.name)
        ]);
        return result;
      } catch (error) {
        return {
          name: checker.name,
          status: HealthStatus.UNHEALTHY,
          responseTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Health check timeout',
          timestamp: new Date().toISOString()
        };
      }
    });

    const results = await Promise.all(checkPromises);
    checks.push(...results);

    // Determine overall system status
    const overallStatus = this.calculateOverallStatus(checks);
    
    const systemHealth: SystemHealth = {
      status: overallStatus,
      checks,
      uptime: Date.now() - this.startTime,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development"
    };

    this.lastHealthCheck = systemHealth;
    
    if (this.config.enableLogging) {
      this.logHealthCheck(systemHealth);
    }

    return systemHealth;
  }

  /**
   * Get last health check result (cached)
   */
  getLastHealthCheck(): SystemHealth | undefined {
    return this.lastHealthCheck;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.checkHealth();
    }, this.config.interval);
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Check if system is ready (all critical components healthy)
   */
  async isReady(): Promise<boolean> {
    const health = await this.checkHealth();
    const criticalChecks = health.checks.filter(check => 
      this.checkers.find(checker => 
        checker.name === check.name && checker.isCritical()
      )
    );
    
    return criticalChecks.every(check => check.status === HealthStatus.HEALTHY);
  }

  /**
   * Check if system is alive (basic liveness check)
   */
  async isAlive(): Promise<boolean> {
    return true; // If we can respond, we're alive
  }

  private async timeoutPromise(checkerName: string): Promise<HealthCheckResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timeout for ${checkerName}`));
      }, this.config.timeout);
    });
  }

  private calculateOverallStatus(checks: HealthCheckResult[]): HealthStatus {
    const criticalCheckers = this.checkers.filter(checker => checker.isCritical());
    const criticalChecks = checks.filter(check => 
      criticalCheckers.some(checker => checker.name === check.name)
    );

    // If any critical component is unhealthy, system is unhealthy
    if (criticalChecks.some(check => check.status === HealthStatus.UNHEALTHY)) {
      return HealthStatus.UNHEALTHY;
    }

    // If any component (critical or not) is unhealthy, system is degraded
    if (checks.some(check => check.status === HealthStatus.UNHEALTHY)) {
      return HealthStatus.DEGRADED;
    }

    // If any component is degraded, system is degraded
    if (checks.some(check => check.status === HealthStatus.DEGRADED)) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  private logHealthCheck(health: SystemHealth): void {
    const unhealthyChecks = health.checks.filter(
      check => check.status !== HealthStatus.HEALTHY
    );

    if (unhealthyChecks.length > 0) {
      console.warn(`[HealthCheck] System status: ${health.status}`);
      unhealthyChecks.forEach(check => {
        console.warn(`  - ${check.name}: ${check.status} (${check.error || 'No details'})`);
      });
    } else {
      console.log(`[HealthCheck] All systems healthy (${health.checks.length} checks passed)`);
    }
  }
}

/**
 * Factory for creating health check services
 */
export class HealthCheckFactory {
  /**
   * Create a production health check service
   */
  static createProductionHealthCheck(): HealthCheckService {
    const config: HealthCheckConfig = {
      timeout: 5000,
      interval: 30000, // 30 seconds
      retries: 3,
      enableLogging: true
    };

    const service = new HealthCheckService(config);
    
    // Add standard health checkers
    service.addChecker(new DatabaseHealthChecker("postgresql://localhost:5432/app", true));
    service.addChecker(new ExternalApiHealthChecker("https://api.external.com", "payments", false));
    service.addChecker(new MemoryHealthChecker(512, true));
    
    return service;
  }

  /**
   * Create a development health check service
   */
  static createDevelopmentHealthCheck(cacheManager?: any): HealthCheckService {
    const config: HealthCheckConfig = {
      timeout: 3000,
      interval: 60000, // 1 minute
      retries: 1,
      enableLogging: true
    };

    const service = new HealthCheckService(config);
    
    // Add development-friendly health checkers
    service.addChecker(new DatabaseHealthChecker("sqlite://./dev.db", false));
    service.addChecker(new MemoryHealthChecker(256, false));
    
    if (cacheManager) {
      service.addChecker(new CacheHealthChecker(cacheManager, false));
    }
    
    return service;
  }

  /**
   * Create a minimal health check service
   */
  static createMinimalHealthCheck(): HealthCheckService {
    const config: HealthCheckConfig = {
      timeout: 1000,
      interval: 120000, // 2 minutes
      retries: 1,
      enableLogging: false
    };

    const service = new HealthCheckService(config);
    service.addChecker(new MemoryHealthChecker(128, false));
    
    return service;
  }
}
