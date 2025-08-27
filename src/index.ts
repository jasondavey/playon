/**
 * Users API Design Demo with Validation and Rate Limiting
 * Demonstrates concrete User interface with CORS, idempotency, validation, and rate limiting
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

// Example usage
async function main() {
  console.log(
    "🚀 Users API Design Demo with Validation and Rate Limiting Starting..."
  );

  // Example 1: Basic users API client (no rate limiting)
  console.log("\n📋 Example 1: Basic Users API client (no rate limiting)");
  const basicUsersApi = new UsersApi("https://jsonplaceholder.typicode.com");

  // Example 2: Users API with moderate rate limiting
  console.log("\n📋 Example 2: Users API with moderate rate limiting");
  const corsOptions: CorsOptions = {
    credentials: "include",
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Correlation-ID",
      "Idempotency-Key",
    ],
    allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 3600,
  };

  const idempotencyOptions: IdempotencyOptions = {
    enabled: true,
    headerName: "Idempotency-Key",
  };

  // Create rate limited API with burst-friendly limits for demo
  const rateLimitOptions: RateLimitOptions = {
    maxRequests: 5,
    windowMs: 10000, // 5 requests per 10 seconds for demo
    enableRetry: true,
    maxRetries: 2,
    retryDelayMs: 1000,
    exponentialBackoff: true,
  };

  const rateLimitedUsersApi = new UsersApi(
    "https://jsonplaceholder.typicode.com",
    {},
    corsOptions,
    idempotencyOptions,
    rateLimitOptions
  );

  // Example 3: Aggressive rate limiting for testing
  console.log(
    "\n📋 Example 3: Aggressive rate limiting (2 requests per 5 seconds)"
  );
  const aggressiveRateLimitApi = new UsersApi(
    "https://jsonplaceholder.typicode.com",
    {},
    {},
    {},
    {
      maxRequests: 2,
      windowMs: 5000, // 2 requests per 5 seconds
      enableRetry: false, // No retry for aggressive demo
    }
  );

  try {
    // Test basic API operations
    console.log("\n👥 Testing basic operations with rate limiting...");

    // GET all users (should work)
    console.log("\n1️⃣ Fetching all users with rate limiting...");
    const users: User[] = await rateLimitedUsersApi.getUsers();
    console.log(`Retrieved ${users.length} users`);
    console.log("Rate limit status:", rateLimitedUsersApi.getRateLimitStatus());

    // GET specific user (should work)
    console.log("\n2️⃣ Fetching specific user...");
    const user: User = await rateLimitedUsersApi.getUser(1);
    console.log(`User: ${user.name} - ${user.email}`);
    console.log("Rate limit status:", rateLimitedUsersApi.getRateLimitStatus());

    // CREATE new user (should work)
    console.log("\n3️⃣ Creating new user...");
    const validUserData: CreateUserData = {
      name: "John Doe",
      username: "johndoe",
      email: "john.doe@example.com",
      phone: "555-0123",
      website: "johndoe.dev",
    };
    const createdUser: User = await rateLimitedUsersApi.createUser(
      validUserData
    );
    console.log(`Created user with ID: ${createdUser.id}`);
    console.log("Rate limit status:", rateLimitedUsersApi.getRateLimitStatus());

    // UPDATE user (should work)
    console.log("\n4️⃣ Updating user...");
    const validUpdateData: UpdateUserData = {
      name: "John Smith",
      email: "john.smith@example.com",
    };
    const updatedUser: User = await rateLimitedUsersApi.updateUser(
      1,
      validUpdateData
    );
    console.log(`Updated user: ${updatedUser.name}`);
    console.log("Rate limit status:", rateLimitedUsersApi.getRateLimitStatus());

    // PATCH user (should work)
    console.log("\n5️⃣ Patching user...");
    const validPatchData: UpdateUserData = {
      phone: "555-9999",
    };
    const patchedUser: User = await rateLimitedUsersApi.patchUser(
      1,
      validPatchData
    );
    console.log(`Patched user phone: ${patchedUser.phone || "N/A"}`);
    console.log("Rate limit status:", rateLimitedUsersApi.getRateLimitStatus());

    // This should trigger rate limiting
    console.log("\n6️⃣ Attempting one more request (should be rate limited)...");
    try {
      await rateLimitedUsersApi.getUser(2);
      console.log("✅ Request succeeded (rate limit not hit)");
    } catch (error) {
      if (error instanceof RateLimitError) {
        console.log(`🚫 Rate limited as expected: ${error.message}`);
        console.log(`   Retry after: ${error.retryAfter}s`);
        console.log(`   Tokens remaining: ${error.tokensRemaining}`);
      }
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(
        `❌ Validation Error in field '${error.field}': ${error.message}`
      );
      console.error(`   Invalid value: ${JSON.stringify(error.value)}`);
    } else if (error instanceof RateLimitError) {
      console.error(`🚫 Rate Limit Error: ${error.message}`);
      console.error(`   Retry after: ${error.retryAfter}s`);
    } else {
      console.error(
        "❌ API Error:",
        error instanceof Error ? error.message : error
      );
    }
  }

  // Demonstrate aggressive rate limiting
  console.log("\n🔥 Testing aggressive rate limiting...");
  try {
    console.log("Making 3 rapid requests (limit: 2 per 5 seconds)...");

    // First request (should work)
    await aggressiveRateLimitApi.getUser(1);
    console.log("✅ Request 1: Success");

    // Second request (should work)
    await aggressiveRateLimitApi.getUser(2);
    console.log("✅ Request 2: Success");

    // Third request (should be rate limited)
    await aggressiveRateLimitApi.getUser(3);
    console.log("✅ Request 3: Success (unexpected!)");
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.log(`🚫 Request 3: Rate limited as expected - ${error.message}`);
    }
  }

  // Demonstrate rate limiter factory patterns
  console.log("\n🏭 Testing rate limiter factory patterns...");

  // Conservative rate limiter
  const conservativeApi = new UsersApi(
    "https://jsonplaceholder.typicode.com",
    {},
    {},
    {},
    { maxRequests: 60, windowMs: 60000, enableRetry: true }
  );

  console.log(
    "Conservative API (60/min) status:",
    conservativeApi.getRateLimitStatus()
  );

  // Test validation errors (should still work with rate limiting)
  console.log("\n🧪 Testing validation with rate limiting...");

  try {
    console.log("\n❌ Attempting to create user with invalid email...");
    const invalidUserData = {
      name: "Invalid User",
      username: "invaliduser",
      email: "not-an-email",
      phone: "555-0123",
    };
    await basicUsersApi.createUser(invalidUserData as CreateUserData);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`✅ Validation correctly caught error: ${error.message}`);
    }
  }

  try {
    console.log("\n❌ Attempting to get user with invalid ID...");
    await basicUsersApi.getUser(-1);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`✅ Validation correctly caught error: ${error.message}`);
    }
  }

  console.log("\n✅ Demo completed!");
  console.log("\n📊 Final rate limit statuses:");
  console.log("Rate Limited API:", rateLimitedUsersApi.getRateLimitStatus());
  console.log("Aggressive API:", aggressiveRateLimitApi.getRateLimitStatus());
  console.log("Conservative API:", conservativeApi.getRateLimitStatus());
}

// Run the demo
main().catch(console.error);
