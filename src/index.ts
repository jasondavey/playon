/**
 * Users API Design Demo with Validation, Rate Limiting, and Authentication
 * Demonstrates concrete User interface with CORS, idempotency, validation, rate limiting, and authentication
 */

import {
  UsersApi,
  User,
  CreateUserData,
  UpdateUserData,
  CorsOptions,
  IdempotencyOptions,
} from "./UsersApi.js";
import { ValidationError } from "./UserValidator.js";
import {
  RateLimiterFactory,
  RateLimitError,
  RateLimitOptions,
} from "./RateLimiter.js";
import {
  AuthService,
  AuthServiceFactory,
  AuthenticationError,
  AuthorizationError,
} from "./AuthService.js";

// Example usage
async function main() {
  console.log(
    "🚀 Users API Design Demo with Authentication, Validation, and Rate Limiting Starting..."
  );

  // Create authentication services for different scenarios
  const devAuthService = AuthServiceFactory.createDevelopment();
  const adminAuthService = AuthServiceFactory.createAdminOnly();

  // Example 1: Unauthenticated API client (should fail)
  console.log("\n📋 Example 1: Unauthenticated API client (should fail)");
  const unauthenticatedApi = new UsersApi(
    "https://jsonplaceholder.typicode.com"
  );

  // Example 2: Authenticated API client with rate limiting
  console.log("\n📋 Example 2: Authenticated API client with rate limiting");
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
    devAuthService
  );

  // Example 3: Admin-only API client
  console.log("\n📋 Example 3: Admin-only API client");
  const adminApi = new UsersApi(
    "https://jsonplaceholder.typicode.com",
    {},
    corsOptions,
    idempotencyOptions,
    rateLimitOptions,
    adminAuthService
  );

  // Test authentication scenarios
  console.log("\n🔐 Testing Authentication Scenarios...");

  // Scenario 1: Try API call without authentication (should fail)
  console.log("\n1️⃣ Attempting API call without authentication...");
  try {
    await unauthenticatedApi.getUsers();
    console.log("❌ Unexpected: API call succeeded without authentication");
  } catch (error) {
    console.log("✅ Expected: API call failed without authentication");
  }

  // Scenario 2: Authenticate as regular user
  console.log("\n2️⃣ Authenticating as regular user...");
  try {
    const userSession = await devAuthService.authenticate("user", "user123");
    console.log(
      `✅ Authentication successful: ${
        userSession.username
      } (${userSession.roles.join(", ")})`
    );
    console.log("Session status:", devAuthService.getSessionStatus());

    // Test authenticated API calls
    console.log("\n   Testing authenticated API operations...");

    // GET users (should work)
    console.log("   📋 Fetching users...");
    const users = await authenticatedApi.getUsers();
    console.log(`   ✅ Retrieved ${users.length} users`);
    console.log("   Auth status:", authenticatedApi.getAuthStatus());

    // GET specific user (should work)
    console.log("   👤 Fetching specific user...");
    const user = await authenticatedApi.getUser(1);
    console.log(`   ✅ Retrieved user: ${user.name}`);

    // CREATE user (should work)
    console.log("   ➕ Creating new user...");
    const newUser = await authenticatedApi.createUser({
      name: "Jane Doe",
      username: "janedoe",
      email: "jane.doe@example.com",
      phone: "555-0456",
    });
    console.log(`   ✅ Created user with ID: ${newUser.id}`);

    // Try DELETE user (should fail - requires admin role)
    console.log(
      "   🗑️ Attempting to delete user (should fail - requires admin)..."
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

  // Scenario 3: Authenticate as admin user
  console.log("\n3️⃣ Authenticating as admin user...");
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

    // Test admin operations
    console.log("\n   Testing admin operations...");

    // DELETE user (should work with admin role)
    console.log(
      "   🗑️ Attempting to delete user (should work with admin role)..."
    );
    try {
      await adminApi.deleteUser(1);
      console.log("   ✅ Delete succeeded with admin role");
    } catch (error) {
      console.log(
        "   ℹ️ Delete simulated (JSONPlaceholder doesn't actually delete)"
      );
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.error(
        `❌ Admin authentication failed: ${error.message} (${error.code})`
      );
    }
  }

  // Scenario 4: Test session expiration and fail-fast checks
  console.log("\n4️⃣ Testing session expiration and fail-fast checks...");

  // Create auth service with very short session timeout for demo
  const shortSessionAuth = new AuthService({
    sessionTimeoutMs: 2000, // 2 seconds
    requiredRoles: ["user"],
  });

  const shortSessionApi = new UsersApi(
    "https://jsonplaceholder.typicode.com",
    {},
    {},
    {},
    undefined,
    shortSessionAuth
  );

  try {
    // Authenticate
    await shortSessionAuth.authenticate("user", "user123");
    console.log("✅ Short session authenticated");

    // Make immediate API call (should work)
    await shortSessionApi.getUser(1);
    console.log("✅ Immediate API call succeeded");

    // Wait for session to expire
    console.log("⏳ Waiting for session to expire (3 seconds)...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Try API call after expiration (should fail)
    console.log("🔍 Attempting API call after session expiration...");
    await shortSessionApi.getUser(2);
    console.log("❌ Unexpected: API call succeeded after session expiration");
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.log(
        `✅ Expected: Session expired - ${error.message} (${error.code})`
      );
    }
  }

  // Scenario 5: Test invalid credentials
  console.log("\n5️⃣ Testing invalid credentials...");
  try {
    await devAuthService.authenticate("invalid", "wrongpassword");
    console.log(
      "❌ Unexpected: Authentication succeeded with invalid credentials"
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.log(
        `✅ Expected: Authentication failed - ${error.message} (${error.code})`
      );
    }
  }

  // Scenario 6: Test logout and subsequent API calls
  console.log("\n6️⃣ Testing logout and subsequent API calls...");
  try {
    // Re-authenticate
    await devAuthService.authenticate("user", "user123");
    console.log("✅ Re-authenticated successfully");

    // Make API call (should work)
    await authenticatedApi.getUser(1);
    console.log("✅ API call succeeded while authenticated");

    // Logout
    devAuthService.logout();
    console.log("✅ Logged out successfully");

    // Try API call after logout (should fail)
    await authenticatedApi.getUser(2);
    console.log("❌ Unexpected: API call succeeded after logout");
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.log(
        `✅ Expected: API call failed after logout - ${error.message} (${error.code})`
      );
    }
  }

  // Test validation errors (should still work with authentication)
  console.log("\n🧪 Testing validation with authentication...");

  // Re-authenticate for validation tests
  await devAuthService.authenticate("user", "user123");

  try {
    console.log("\n❌ Attempting to create user with invalid email...");
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
    }
  }

  try {
    console.log("\n❌ Attempting to get user with invalid ID...");
    await authenticatedApi.getUser(-1);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`✅ Validation correctly caught error: ${error.message}`);
    }
  }

  console.log("\n✅ Demo completed!");
  console.log("\n📊 Final status summary:");
  console.log("Dev Auth Service:", devAuthService.getSessionStatus());
  console.log("Admin Auth Service:", adminAuthService.getSessionStatus());
  console.log(
    "Authenticated API Rate Limit:",
    authenticatedApi.getRateLimitStatus()
  );
  console.log("Admin API Rate Limit:", adminApi.getRateLimitStatus());
}

// Run the demo
main().catch(console.error);
