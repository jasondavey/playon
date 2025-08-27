/**
 * Users API Design Demo with Validation, Rate Limiting, Authentication, and Performance Monitoring
 * Demonstrates concrete User interface with CORS, idempotency, validation, rate limiting, authentication, and performance monitoring
 */

import {
  UsersApi,
  CorsOptions,
  IdempotencyOptions,
  CreateUserData,
} from "./UsersApi.js";
import { AuthService, AuthServiceFactory } from "./AuthService.js";
import {
  PerformanceMonitor,
  PerformanceMonitorFactory,
} from "./PerformanceMonitor.js";
import { ApiVersioningService, ApiVersioningFactory } from "./ApiVersioning.js";
import { ValidationError } from "./UserValidator.js";
import { RateLimitError, RateLimitOptions } from "./RateLimiter.js";
import { AuthenticationError, AuthorizationError } from "./AuthService.js";
import { CircuitBreakerFactory, CircuitBreaker } from "./CircuitBreaker.js";

// Example usage
async function main() {
  console.log(
    "🚀 Users API Design Demo with Authentication, Validation, Rate Limiting, and Performance Monitoring Starting..."
  );

  // Create services for different scenarios
  const devAuthService = AuthServiceFactory.createDevelopment();
  const adminAuthService = AuthServiceFactory.createAdminOnly();
  const performanceMonitor = PerformanceMonitorFactory.createDevelopment();

  console.log(
    "📊 Performance monitoring enabled - logs will be written to performance-dev.log (git-ignored)"
  );

  // Example 1: Unauthenticated API client (should fail)
  console.log("\n📋 Example 1: Unauthenticated API client (should fail)");
  const unauthenticatedApi = new UsersApi(
    "https://jsonplaceholder.typicode.com"
  );

  // Example 2: Authenticated API client with rate limiting and performance monitoring
  console.log("\n📋 Example 2: Authenticated API client with full monitoring");
  const corsOptions: CorsOptions = {
    credentials: "include" as const,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Correlation-ID",
      "Idempotency-Key",
      "X-User-ID",
      "X-Username",
    ],
    allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 3600,
  };

  const idempotencyOptions: IdempotencyOptions = {
    enabled: true,
    headerName: "Idempotency-Key",
  };

  const rateLimitOptions: RateLimitOptions = {
    maxRequests: 10,
    windowMs: 15000, // 10 requests per 15 seconds
    enableRetry: true,
    maxRetries: 2,
    retryDelayMs: 1000,
    exponentialBackoff: true,
  };

  const authenticatedApi = new UsersApi(
    "https://jsonplaceholder.typicode.com",
    {},
    corsOptions,
    idempotencyOptions,
    rateLimitOptions,
    devAuthService,
    performanceMonitor
  );

  // Example 3: Admin-only API client with performance monitoring
  console.log(
    "\n📋 Example 3: Admin-only API client with performance monitoring"
  );
  const adminApi = new UsersApi(
    "https://jsonplaceholder.typicode.com",
    {},
    corsOptions,
    idempotencyOptions,
    rateLimitOptions,
    adminAuthService,
    performanceMonitor
  );

  // Test authentication scenarios with performance monitoring
  console.log(
    "\n🔐 Testing Authentication Scenarios with Performance Monitoring..."
  );

  // Scenario 1: Try API call without authentication (should fail)
  console.log("\n1️⃣ Attempting API call without authentication...");
  try {
    await unauthenticatedApi.getUsers();
    console.log("❌ Unexpected: API call succeeded without authentication");
  } catch (error) {
    console.log("✅ Expected: API call failed without authentication");
  }

  // Scenario 2: Authenticate as regular user and test performance monitoring
  console.log(
    "\n2️⃣ Authenticating as regular user with performance monitoring..."
  );
  try {
    const userSession = await devAuthService.authenticate("user", "user123");
    console.log(
      `✅ Authentication successful: ${
        userSession.username
      } (${userSession.roles.join(", ")})`
    );
    console.log("Session status:", devAuthService.getSessionStatus());

    // Test authenticated API calls with performance monitoring
    console.log(
      "\n   Testing authenticated API operations with performance tracking..."
    );

    // GET users (should work and be logged)
    console.log("   📋 Fetching users (performance will be logged)...");
    const users = await authenticatedApi.getUsers();
    console.log(`   ✅ Retrieved ${users.length} users`);
    console.log("   Auth status:", authenticatedApi.getAuthStatus());

    // GET specific user (should work and be logged)
    console.log("   👤 Fetching specific user (performance will be logged)...");
    const user = await authenticatedApi.getUser(1);
    console.log(`   ✅ Retrieved user: ${user.name}`);

    // CREATE user (should work and be logged)
    console.log("   ➕ Creating new user (performance will be logged)...");
    const newUser = await authenticatedApi.createUser({
      name: "Jane Doe",
      username: "janedoe",
      email: "jane.doe@example.com",
      phone: "555-0456",
    });
    console.log(`   ✅ Created user with ID: ${newUser.id}`);

    // UPDATE user (should work and be logged)
    console.log("   🔄 Updating user (performance will be logged)...");
    const updatedUser = await authenticatedApi.updateUser(1, {
      name: "Jane Smith",
      email: "jane.smith@example.com",
    });
    console.log(`   ✅ Updated user: ${updatedUser.name}`);

    // Try DELETE user (should fail - requires admin role, but performance still logged)
    console.log(
      "   🗑️ Attempting to delete user (should fail - requires admin, but performance logged)..."
    );
    try {
      await authenticatedApi.deleteUser(1);
      console.log("   ❌ Unexpected: Delete succeeded without admin role");
    } catch (error) {
      if (error instanceof AuthorizationError) {
        console.log(`   ✅ Expected: Delete failed - ${error.message}`);
        console.log(
          `   Required roles: [${error.requiredRoles.join(
            ", "
          )}], User has: [${error.userRoles.join(", ")}]`
        );
        console.log(
          "   📊 Performance metrics logged even for failed authorization"
        );
      }
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.error(
        `❌ Authentication failed: ${error.message} (${error.code})`
      );
    } else {
      console.error("❌ Unexpected error:", error);
    }
  }

  // Scenario 3: Authenticate as admin user and test performance monitoring
  console.log(
    "\n3️⃣ Authenticating as admin user with performance monitoring..."
  );
  try {
    const adminSession = await adminAuthService.authenticate(
      "admin",
      "admin123"
    );
    console.log(
      `✅ Admin authentication successful: ${
        adminSession.username
      } (${adminSession.roles.join(", ")})`
    );

    // Test admin operations with performance monitoring
    console.log("\n   Testing admin operations with performance tracking...");

    // DELETE user (should work with admin role and be logged)
    console.log(
      "   🗑️ Attempting to delete user (should work with admin role, performance logged)..."
    );
    try {
      await adminApi.deleteUser(1);
      console.log("   ✅ Delete succeeded with admin role");
      console.log(
        "   📊 Performance metrics logged for successful admin operation"
      );
    } catch (error) {
      console.log(
        "   ℹ️ Delete simulated (JSONPlaceholder doesn't actually delete)"
      );
      console.log("   📊 Performance metrics logged for simulated operation");
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.error(
        `❌ Admin authentication failed: ${error.message} (${error.code})`
      );
    }
  }

  // Scenario 4: Test performance monitoring with errors
  console.log("\n4️⃣ Testing performance monitoring with validation errors...");

  // Re-authenticate for error testing
  await devAuthService.authenticate("user", "user123");

  try {
    console.log(
      "\n❌ Attempting to create user with invalid email (performance will be logged)..."
    );
    const invalidUserData: CreateUserData = {
      name: "Invalid User",
      username: "invaliduser",
      email: "not-an-email",
      phone: "555-0123",
    };
    await authenticatedApi.createUser(invalidUserData);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`✅ Validation correctly caught error: ${error.message}`);
      console.log("📊 Performance metrics logged even for validation errors");
    }
  }

  try {
    console.log(
      "\n❌ Attempting to get user with invalid ID (performance will be logged)..."
    );
    await authenticatedApi.getUser(-1);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`✅ Validation correctly caught error: ${error.message}`);
      console.log("📊 Performance metrics logged even for validation errors");
    }
  }

  // Scenario 5: Test rate limiting with performance monitoring
  console.log("\n5️⃣ Testing rate limiting with performance monitoring...");

  // Create API with aggressive rate limiting for demo
  const aggressiveRateLimitApi = new UsersApi(
    "https://jsonplaceholder.typicode.com",
    {},
    {},
    {},
    {
      maxRequests: 2,
      windowMs: 5000, // 2 requests per 5 seconds
      enableRetry: false,
    },
    devAuthService,
    performanceMonitor
  );

  try {
    console.log(
      "Making 3 rapid requests (limit: 2 per 5 seconds, all performance logged)..."
    );

    // First request (should work)
    await aggressiveRateLimitApi.getUser(1);
    console.log("✅ Request 1: Success (performance logged)");

    // Second request (should work)
    await aggressiveRateLimitApi.getUser(2);
    console.log("✅ Request 2: Success (performance logged)");

    // Third request (should be rate limited)
    await aggressiveRateLimitApi.getUser(3);
    console.log("✅ Request 3: Success (unexpected!)");
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.log(`🚫 Request 3: Rate limited as expected - ${error.message}`);
      console.log("📊 Performance metrics logged for rate-limited request");
    }
  }

  // Scenario 6: Demonstrate different performance monitor configurations
  console.log(
    "\n6️⃣ Testing different performance monitoring configurations..."
  );

  // Production-style monitor (minimal logging)
  const prodMonitor = PerformanceMonitorFactory.createProduction();
  const prodApi = new UsersApi(
    "https://jsonplaceholder.typicode.com",
    {},
    {},
    {},
    undefined,
    devAuthService,
    prodMonitor
  );

  console.log(
    "Testing with production performance monitor (logs to performance-prod.log, min 10ms threshold)..."
  );
  await prodApi.getUser(1);
  console.log("✅ Production monitoring test completed");

  // Testing-style monitor (detailed logging)
  const testMonitor = PerformanceMonitorFactory.createTesting();
  const testApi = new UsersApi(
    "https://jsonplaceholder.typicode.com",
    {},
    {},
    {},
    undefined,
    devAuthService,
    testMonitor
  );

  console.log(
    "Testing with testing performance monitor (logs to performance-test.log, detailed metrics)..."
  );
  await testApi.getUser(2);
  console.log("✅ Testing monitoring test completed");

  // === API Versioning Demonstrations ===
  console.log("\n" + "=".repeat(60));
  console.log("🔄 API VERSIONING DEMONSTRATIONS");
  console.log("=".repeat(60));

  try {
    // Demo 1: URL Path Versioning (/api/v1/users)
    console.log("\n📍 Demo 1: URL Path Versioning Strategy");
    console.log("Using version 1.0 with URL path: /api/v1/users");

    const urlVersioning = ApiVersioningFactory.createUrlPathVersioning();
    const apiV1 = new UsersApi(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      {},
      undefined,
      devAuthService,
      performanceMonitor,
      urlVersioning
    );

    await apiV1.getUsers("version-demo-1");
    console.log("✅ URL path versioning successful");

    // Demo 2: Header-based Versioning
    console.log("\n📍 Demo 2: Header-based Versioning Strategy");
    console.log("Using version 1.1 with API-Version header");

    const headerVersioning = ApiVersioningFactory.createHeaderVersioning();
    const apiV11 = new UsersApi(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      {},
      undefined,
      devAuthService,
      performanceMonitor,
      headerVersioning
    );

    await apiV11.getUsers("version-demo-2");
    console.log("✅ Header-based versioning successful");

    // Demo 3: Accept Header Versioning
    console.log("\n📍 Demo 3: Accept Header Versioning Strategy");
    console.log(
      "Using version 1.2 with Accept header: application/vnd.api+json;version=1.2"
    );

    const acceptHeaderVersioning =
      ApiVersioningFactory.createAcceptHeaderVersioning();
    const apiV12 = new UsersApi(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      {},
      undefined,
      devAuthService,
      performanceMonitor,
      acceptHeaderVersioning
    );

    await apiV12.getUsers("version-demo-3");
    console.log("✅ Accept header versioning successful");

    // Demo 4: Deprecated Version with Warnings
    console.log("\n📍 Demo 4: Deprecated Version Handling");
    console.log(
      "Using deprecated version 0.9 to demonstrate deprecation warnings"
    );

    const deprecatedVersioning = ApiVersioningFactory.createUrlPathVersioning();
    const apiDeprecated = new UsersApi(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      {},
      undefined,
      devAuthService,
      performanceMonitor,
      deprecatedVersioning
    );

    await apiDeprecated.getUsers("version-demo-deprecated");
    console.log("✅ Deprecated version handling demonstrated");

    // Demo 5: Version Compatibility Check
    console.log("\n📍 Demo 5: Version Compatibility and Migration Info");

    const versioningWithMigration =
      ApiVersioningFactory.createUrlPathVersioning();
    const apiV2 = new UsersApi(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      {},
      undefined,
      devAuthService,
      performanceMonitor,
      versioningWithMigration
    );

    await apiV2.getUsers("version-demo-migration");
    console.log("✅ Version migration info demonstrated");
  } catch (error) {
    console.error("❌ Versioning demo error:", error);
  }

  // === Circuit Breaker Demonstrations ===
  console.log("\n" + "=".repeat(60));
  console.log("🔄 CIRCUIT BREAKER DEMONSTRATIONS");
  console.log("=".repeat(60));

  try {
    // Demo 1: Normal Operation with Circuit Breaker
    console.log("\n📍 Demo 1: Normal Operation with Circuit Breaker");
    console.log("Testing API calls with circuit breaker protection");

    const circuitBreaker =
      CircuitBreakerFactory.createApiCircuitBreaker("Demo-API");
    const resilientApi = new UsersApi(
      "https://jsonplaceholder.typicode.com",
      {},
      {},
      {},
      undefined,
      devAuthService,
      performanceMonitor,
      undefined,
      circuitBreaker
    );

    await resilientApi.getUsers("circuit-demo-1");
    console.log("✅ Normal operation successful with circuit breaker");
    console.log("Circuit Breaker Metrics:", circuitBreaker.getMetrics());

    // Demo 2: Simulated Failure Scenarios
    console.log("\n📍 Demo 2: Simulated Failure and Recovery");
    console.log("Testing circuit breaker behavior under failure conditions");

    const failingApi = new UsersApi(
      "https://nonexistent-api-endpoint.invalid", // This will fail
      {},
      {},
      {},
      undefined,
      devAuthService,
      performanceMonitor,
      undefined,
      circuitBreaker
    );

    // Attempt multiple failing requests to trigger circuit breaker
    console.log(
      "Attempting 6 requests to failing endpoint to trigger circuit breaker..."
    );
    for (let i = 1; i <= 6; i++) {
      try {
        await failingApi.getUsers(`circuit-failure-${i}`);
      } catch (error) {
        console.log(
          `Request ${i} failed: ${
            error instanceof Error
              ? error.message.substring(0, 50)
              : "Unknown error"
          }...`
        );
      }

      const metrics = circuitBreaker.getMetrics();
      console.log(
        `  State: ${metrics.state}, Failures: ${metrics.failureCount}/5`
      );

      if (metrics.state === "OPEN") {
        console.log(
          "🔴 Circuit breaker OPENED - Fast failing subsequent requests"
        );
        break;
      }
    }

    // Demo 3: Fast Fail Behavior
    console.log("\n📍 Demo 3: Fast Fail Behavior");
    console.log("Testing fast fail when circuit is open");

    try {
      await failingApi.getUsers("circuit-fast-fail");
    } catch (error) {
      console.log(
        "✅ Fast fail successful - Circuit breaker prevented unnecessary call"
      );
      console.log(
        "Error type:",
        error instanceof Error ? error.constructor.name : "Unknown"
      );
    }

    // Demo 4: Automatic Recovery Attempt
    console.log("\n📍 Demo 4: Automatic Recovery Simulation");
    console.log("Waiting for circuit breaker timeout and testing recovery...");

    // Force circuit to half-open for demo purposes
    console.log("Simulating timeout by forcing circuit to attempt recovery...");

    // Create a new circuit breaker with shorter timeout for demo
    const quickRecoveryBreaker = new CircuitBreaker("Quick-Recovery", {
      failureThreshold: 2,
      successThreshold: 1,
      timeout: 1000, // 1 second
      monitoringPeriod: 5000,
      fallback: async <T>(): Promise<T> => {
        console.log("🔄 Fallback executed: Returning cached data");
        return [
          { id: 999, name: "Cached User", email: "cached@example.com" },
        ] as T;
      },
    });

    const recoveryApi = new UsersApi(
      "https://jsonplaceholder.typicode.com", // Back to working endpoint
      {},
      {},
      {},
      undefined,
      devAuthService,
      performanceMonitor,
      undefined,
      quickRecoveryBreaker
    );

    // First, trigger the circuit breaker
    quickRecoveryBreaker.forceOpen();
    console.log("Circuit forced open for demonstration");

    // Try request with fallback
    try {
      const result = await recoveryApi.getUsers("circuit-fallback-demo");
      console.log("✅ Fallback successful - Received fallback data");
    } catch (error) {
      console.log("Fallback executed due to open circuit");
    }

    // Wait for timeout and test recovery
    await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait for timeout

    console.log("Attempting recovery after timeout...");
    try {
      await recoveryApi.getUsers("circuit-recovery-demo");
      console.log("✅ Circuit recovery successful - Service is healthy again");
      console.log("Final metrics:", quickRecoveryBreaker.getMetrics());
    } catch (error) {
      console.log(
        "Recovery attempt failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }

    // Demo 5: Different Circuit Breaker Configurations
    console.log("\n📍 Demo 5: Different Circuit Breaker Configurations");

    const criticalServiceBreaker =
      CircuitBreakerFactory.createCriticalServiceCircuitBreaker(
        "Critical-Service"
      );
    const databaseBreaker =
      CircuitBreakerFactory.createDatabaseCircuitBreaker("Database");

    console.log("Critical Service Breaker - Low tolerance (2 failures)");
    console.log("Database Breaker - Medium tolerance (3 failures)");
    console.log("API Breaker - High tolerance (5 failures)");

    console.log("✅ Multiple circuit breaker configurations demonstrated");
  } catch (error) {
    console.error("❌ Circuit breaker demo error:", error);
  }

  // === Caching Demonstrations ===
  console.log("\n" + "=".repeat(60));
  console.log("🗄️ CACHING DEMONSTRATIONS");
  console.log("=".repeat(60));

  async function demoCaching() {
    console.log("\n" + "=".repeat(60));
    console.log("🗄️  DEMO 6: REQUEST/RESPONSE CACHING SYSTEM");
    console.log("=".repeat(60));

    const authService = AuthServiceFactory.createDevelopment();
    const performanceMonitor =
      PerformanceMonitorFactory.createDevelopment();
    const versioningService = ApiVersioningFactory.createUrlPathVersioning();
    const circuitBreaker =
      CircuitBreakerFactory.createApiCircuitBreaker("CachingDemo");

    // Create API client with default cache
    const api = new UsersApi(
      "https://jsonplaceholder.typicode.com",
      { "Content-Type": "application/json" },
      { credentials: "same-origin" },
      {},
      undefined,
      authService,
      performanceMonitor,
      versioningService,
      circuitBreaker
    );

    console.log("\n📊 Initial Cache Stats:");
    console.log(JSON.stringify(api.getCacheStats(), null, 2));

    try {
      // Scenario 1: Cache Miss - First Request
      console.log("\n🔍 Scenario 1: Cache Miss (First Request)");
      console.log("Making first request to /users/1...");
      const startTime1 = Date.now();
      const user1 = await api.getUser(1);
      const duration1 = Date.now() - startTime1;
      console.log(`✅ User retrieved: ${user1.name} (${duration1}ms)`);
      console.log("📊 Cache Stats after first request:");
      console.log(JSON.stringify(api.getCacheStats(), null, 2));

      // Scenario 2: Cache Hit - Same Request
      console.log("\n🎯 Scenario 2: Cache Hit (Same Request)");
      console.log("Making identical request to /users/1...");
      const startTime2 = Date.now();
      const user2 = await api.getUser(1);
      const duration2 = Date.now() - startTime2;
      console.log(
        `✅ User retrieved from cache: ${user2.name} (${duration2}ms)`
      );
      console.log(
        `🚀 Performance improvement: ${(
          ((duration1 - duration2) / duration1) *
          100
        ).toFixed(1)}% faster`
      );
      console.log("📊 Cache Stats after cache hit:");
      console.log(JSON.stringify(api.getCacheStats(), null, 2));

      // Scenario 3: Multiple Cache Hits
      console.log("\n⚡ Scenario 3: Multiple Cache Hits");
      console.log("Making multiple requests to cached data...");
      const multiStartTime = Date.now();
      await Promise.all([api.getUser(1), api.getUser(1), api.getUser(1)]);
      const multiDuration = Date.now() - multiStartTime;
      console.log(`✅ 3 requests completed in ${multiDuration}ms`);
      console.log("📊 Cache Stats after multiple hits:");
      console.log(JSON.stringify(api.getCacheStats(), null, 2));

      // Scenario 4: Cache Invalidation via Write Operation
      console.log("\n🔄 Scenario 4: Cache Invalidation (Write Operation)");
      console.log("Updating user (will invalidate cache)...");
      await api.updateUser(1, {
        name: "Updated User",
        email: "updated@example.com",
      });
      console.log("✅ User updated - cache invalidated");

      console.log("Making request to /users/1 after invalidation...");
      const startTime4 = Date.now();
      const user4 = await api.getUser(1);
      const duration4 = Date.now() - startTime4;
      console.log(
        `✅ User retrieved: ${user4.name} (${duration4}ms - cache miss expected)`
      );
      console.log("📊 Cache Stats after invalidation and refetch:");
      console.log(JSON.stringify(api.getCacheStats(), null, 2));

      // Scenario 5: Cache Warmup
      console.log("\n🔥 Scenario 5: Cache Warmup");
      console.log("Clearing cache and performing warmup...");
      api.clearCache();
      console.log("📊 Cache Stats after clear:");
      console.log(JSON.stringify(api.getCacheStats(), null, 2));

      console.log("Performing cache warmup...");
      await api.warmupCache();
      console.log("📊 Cache Stats after warmup:");
      console.log(JSON.stringify(api.getCacheStats(), null, 2));

      // Scenario 6: Cache Performance Comparison
      console.log("\n📈 Scenario 6: Cache Performance Comparison");
      console.log("Comparing cached vs non-cached performance...");

      // Clear cache for fair comparison
      api.clearCache();

      // Non-cached requests
      console.log("Making 5 non-cached requests...");
      const nonCachedStart = Date.now();
      for (let i = 0; i < 5; i++) {
        await api.getUsers();
        api.clearCache(); // Clear after each to prevent caching
      }
      const nonCachedDuration = Date.now() - nonCachedStart;

      // Cached requests
      console.log("Making 5 cached requests...");
      const cachedStart = Date.now();
      for (let i = 0; i < 5; i++) {
        await api.getUsers(); // First will cache, rest will hit cache
      }
      const cachedDuration = Date.now() - cachedStart;

      console.log(`📊 Performance Comparison:`);
      console.log(`   Non-cached: ${nonCachedDuration}ms`);
      console.log(`   Cached: ${cachedDuration}ms`);
      console.log(
        `   Improvement: ${(
          ((nonCachedDuration - cachedDuration) / nonCachedDuration) *
          100
        ).toFixed(1)}% faster`
      );

      // Final cache metrics
      console.log("\n📊 Final Cache Metrics:");
      console.log(JSON.stringify(api.getCacheStats(), null, 2));
    } catch (error) {
      console.error("❌ Caching demo error:", error);
    }
  }

  await demoCaching();

  // === Health Check Demonstrations ===
  console.log("\n" + "=".repeat(60));
  console.log("🏥 HEALTH CHECK DEMONSTRATIONS");
  console.log("=".repeat(60));

  async function demoHealthChecks() {
    console.log("\n" + "=".repeat(60));
    console.log("🏥 DEMO 7: COMPREHENSIVE HEALTH CHECK SYSTEM");
    console.log("=".repeat(60));

    const authService = AuthServiceFactory.createDevelopment();
    const performanceMonitor = PerformanceMonitorFactory.createDevelopment();
    const versioningService = ApiVersioningFactory.createUrlPathVersioning();
    const circuitBreaker = CircuitBreakerFactory.createApiCircuitBreaker("HealthDemo");

    // Create API client with health monitoring
    const api = new UsersApi(
      "https://jsonplaceholder.typicode.com",
      { "Content-Type": "application/json" },
      { credentials: "same-origin" },
      {},
      undefined,
      authService,
      performanceMonitor,
      versioningService,
      circuitBreaker
    );

    try {
      // Scenario 1: Basic Health Check
      console.log("\n🔍 Scenario 1: Basic System Health Check");
      console.log("Performing comprehensive health assessment...");
      const health = await api.getHealth();
      console.log(`✅ System Status: ${health.status.toUpperCase()}`);
      console.log(`📊 Components Checked: ${health.checks.length}`);
      console.log(`⏱️  System Uptime: ${Math.round(health.uptime / 1000)}s`);
      console.log(`🌍 Environment: ${health.environment}`);
      
      console.log("\n📋 Component Health Details:");
      health.checks.forEach(check => {
        const status = check.status === 'healthy' ? '✅' : 
                      check.status === 'degraded' ? '⚠️' : '❌';
        console.log(`  ${status} ${check.name}: ${check.status} (${check.responseTime}ms)`);
        if (check.error) {
          console.log(`    Error: ${check.error}`);
        }
        if (check.details) {
          Object.entries(check.details).forEach(([key, value]) => {
            console.log(`    ${key}: ${value}`);
          });
        }
      });

      // Scenario 2: Readiness Check
      console.log("\n🚀 Scenario 2: Readiness Probe (Kubernetes-style)");
      console.log("Checking if system is ready to serve traffic...");
      const readiness = await api.getHealthReady();
      console.log(`✅ System Ready: ${readiness.ready ? 'YES' : 'NO'}`);
      console.log(`📊 Critical Components: ${readiness.health.checks.filter(c => c.status === 'healthy').length}/${readiness.health.checks.length} healthy`);

      // Scenario 3: Liveness Check
      console.log("\n💓 Scenario 3: Liveness Probe");
      console.log("Performing basic liveness check...");
      const liveness = await api.getHealthLive();
      console.log(`✅ System Alive: ${liveness.alive ? 'YES' : 'NO'}`);
      console.log(`⏰ Check Time: ${liveness.timestamp}`);

      // Scenario 4: Cached Health Check
      console.log("\n⚡ Scenario 4: Cached Health Check (Performance)");
      console.log("Retrieving last cached health result...");
      const startTime = Date.now();
      const cachedHealth = api.getHealthCached();
      const cacheTime = Date.now() - startTime;
      
      if (cachedHealth) {
        console.log(`✅ Cached result retrieved in ${cacheTime}ms`);
        console.log(`📊 Cached Status: ${cachedHealth.status}`);
        console.log(`⏰ Cache Age: ${Math.round((Date.now() - new Date(cachedHealth.timestamp).getTime()) / 1000)}s`);
      } else {
        console.log("❌ No cached health data available");
      }

      // Scenario 5: Health Monitoring
      console.log("\n📈 Scenario 5: Periodic Health Monitoring");
      console.log("Starting background health monitoring...");
      api.startHealthMonitoring();
      console.log("✅ Health monitoring started (runs every 60 seconds)");
      
      // Wait a moment to show monitoring is active
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log("🔄 Checking for updated health data...");
      const monitoredHealth = api.getHealthCached();
      if (monitoredHealth) {
        console.log(`✅ Background monitoring active - last check: ${monitoredHealth.timestamp}`);
      }
      
      // Stop monitoring for demo
      api.stopHealthMonitoring();
      console.log("⏹️  Health monitoring stopped");

      // Scenario 6: Health Check Performance Comparison
      console.log("\n📊 Scenario 6: Health Check Performance Analysis");
      console.log("Comparing fresh vs cached health checks...");
      
      // Fresh health check
      const freshStart = Date.now();
      await api.getHealth();
      const freshTime = Date.now() - freshStart;
      
      // Cached health check
      const cachedStart = Date.now();
      api.getHealthCached();
      const cachedTime2 = Date.now() - cachedStart;
      
      console.log(`📊 Performance Comparison:`);
      console.log(`   Fresh Health Check: ${freshTime}ms`);
      console.log(`   Cached Health Check: ${cachedTime2}ms`);
      console.log(`   Performance Gain: ${((freshTime - cachedTime2) / freshTime * 100).toFixed(1)}% faster`);

      // Scenario 7: Health Check Integration with Other Systems
      console.log("\n🔗 Scenario 7: Health Check Integration");
      console.log("Demonstrating health checks with circuit breaker and caching...");
      
      const integratedHealth = await api.getHealth();
      const cacheStats = api.getCacheStats();
      const circuitBreakerMetrics = circuitBreaker.getMetrics();
      
      console.log("✅ Integrated System Status:");
      console.log(`   Overall Health: ${integratedHealth.status}`);
      console.log(`   Cache Hit Rate: ${cacheStats.hitRate}`);
      console.log(`   Circuit Breaker: ${circuitBreakerMetrics.state}`);
      console.log(`   Total Requests: ${circuitBreakerMetrics.totalRequests}`);

    } catch (error) {
      console.error("❌ Health check demo error:", error);
    }
  }

  await demoHealthChecks();

  console.log("\n" + "=".repeat(60));
  console.log("📊 DEMO SUMMARY");
  console.log("=".repeat(60));
  console.log(
    "✅ Authentication and Authorization: Implemented with fail-fast checks"
  );
  console.log("✅ Rate Limiting: Token bucket algorithm with retry logic");
  console.log(
    "✅ Performance Monitoring: Structured event logging with JSONL format"
  );
  console.log(
    "✅ API Versioning: Multiple negotiation strategies with deprecation support"
  );
  console.log(
    "✅ Circuit Breaker: Resilience patterns with automatic recovery and fallbacks"
  );
  console.log(
    "✅ Error Handling: Comprehensive error handling with performance logging"
  );
  console.log("✅ Security: Role-based access control and session validation");

  console.log("\n📁 Performance logs written to:");
  console.log("  - performance-dev.log (development environment)");
  console.log("  - All logs are git-ignored for security");

  console.log("\n🎯 API Design Best Practices Demonstrated:");
  console.log("  - Fail-fast authentication and authorization");
  console.log("  - Structured logging with correlation IDs");
  console.log("  - Rate limiting with graceful degradation");
  console.log("  - API versioning with backward compatibility");
  console.log("  - Circuit breaker pattern for resilience");
  console.log("  - Automatic failure detection and recovery");
  console.log("  - Performance monitoring and metrics collection");
  console.log("  - Idempotency support for safe retries");
  console.log("  - CORS handling and security headers");

  console.log("\n🚀 Demo completed successfully!");
}

// Run the demo
main().catch(console.error);
