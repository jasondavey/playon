/**
 * Users API Design Demo with Validation, Rate Limiting, Authentication, and Performance Monitoring
 * Demonstrates concrete User interface with CORS, idempotency, validation, rate limiting, authentication, and performance monitoring
 */

import {
  UsersApi,
  CreateUserData,
  CorsOptions,
  IdempotencyOptions,
} from "./UsersApi.js";
import { ValidationError } from "./UserValidator.js";
import { RateLimitError, RateLimitOptions } from "./RateLimiter.js";
import {
  AuthServiceFactory,
  AuthenticationError,
  AuthorizationError,
} from "./AuthService.js";
import { PerformanceMonitorFactory } from "./PerformanceMonitor.js";

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
    credentials: "include",
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
    const invalidUserData = {
      name: "Invalid User",
      username: "invaliduser",
      email: "not-an-email",
      phone: "555-0123",
    };
    await authenticatedApi.createUser(invalidUserData as CreateUserData);
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

  console.log("\n✅ Demo completed!");
  console.log("\n📊 Final status summary:");
  console.log("Dev Auth Service:", devAuthService.getSessionStatus());
  console.log("Admin Auth Service:", adminAuthService.getSessionStatus());
  console.log(
    "Authenticated API Rate Limit:",
    authenticatedApi.getRateLimitStatus()
  );
  console.log("Admin API Rate Limit:", adminApi.getRateLimitStatus());

  console.log("\n📁 Performance logs written to:");
  console.log(
    "- performance-dev.log (development monitoring with console output)"
  );
  console.log(
    "- performance-prod.log (production monitoring, minimal logging)"
  );
  console.log("- performance-test.log (testing monitoring, detailed metrics)");
  console.log(
    "\n💡 All log files are git-ignored and contain structured JSONL format data"
  );
  console.log(
    "💡 Each log entry includes timing breakdown: auth, rateLimit, validation, network phases"
  );
  console.log(
    "💡 Logs include correlation IDs, user context, payload sizes, and error details"
  );
}

// Run the demo
main().catch(console.error);
