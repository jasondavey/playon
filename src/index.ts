/**
 * Users API Design Demo with Validation
 * Demonstrates concrete User interface with CORS, idempotency, and data validation
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

// Example usage
async function main() {
  console.log("🚀 Users API Design Demo with Validation Starting...");

  // Example 1: Basic users API client
  console.log("\n📋 Example 1: Basic Users API client");
  const basicUsersApi = new UsersApi("https://jsonplaceholder.typicode.com");

  // Example 2: Users API with idempotency enabled
  console.log("\n📋 Example 2: Users API with automatic idempotency");
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

  const idempotentUsersApi = new UsersApi(
    "https://jsonplaceholder.typicode.com",
    {},
    corsOptions,
    idempotencyOptions
  );

  try {
    // GET all users (with response validation)
    console.log("\n👥 Fetching all users...");
    const users: User[] = await basicUsersApi.getUsers();
    console.log(`Retrieved ${users.length} users:`);
    users
      .slice(0, 3)
      .forEach((user) => console.log(`- ${user.name} (${user.email})`));

    // GET specific user (with ID validation)
    console.log("\n👤 Fetching specific user...");
    const user: User = await basicUsersApi.getUser(1);
    console.log(`User: ${user.name} - ${user.email}`);

    // CREATE new user with valid data
    console.log("\n➕ Creating new user with valid data...");
    const validUserData: CreateUserData = {
      name: "John Doe",
      username: "johndoe",
      email: "john.doe@example.com",
      phone: "555-0123",
      website: "johndoe.dev",
    };
    const createdUser: User = await idempotentUsersApi.createUser(
      validUserData
    );
    console.log(`Created user with ID: ${createdUser.id}`);

    // UPDATE user with valid data
    console.log("\n🔄 Updating user with valid data...");
    const validUpdateData: UpdateUserData = {
      name: "John Smith",
      email: "john.smith@example.com",
    };
    const customIdempotencyKey = "user-update-operation-12345";
    const updatedUser: User = await basicUsersApi.updateUser(
      1,
      validUpdateData,
      "custom-correlation-id",
      customIdempotencyKey
    );
    console.log(`Updated user: ${updatedUser.name}`);

    // PATCH user with valid data
    console.log("\n🔧 Partially updating user with valid data...");
    const validPatchData: UpdateUserData = {
      phone: "555-9999",
    };
    const patchedUser: User = await idempotentUsersApi.patchUser(
      1,
      validPatchData
    );
    console.log(`Patched user phone: ${patchedUser.phone || "N/A"}`);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(
        `❌ Validation Error in field '${error.field}': ${error.message}`
      );
      console.error(`   Invalid value: ${JSON.stringify(error.value)}`);
    } else {
      console.error(
        "❌ API Error:",
        error instanceof Error ? error.message : error
      );
    }
  }

  // Demonstrate validation errors
  console.log("\n🧪 Testing validation with invalid data...");

  try {
    console.log("\n❌ Attempting to create user with invalid email...");
    const invalidUserData = {
      name: "Invalid User",
      username: "invaliduser",
      email: "not-an-email", // Invalid email format
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
    await basicUsersApi.getUser(-1); // Invalid ID (negative)
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`✅ Validation correctly caught error: ${error.message}`);
    }
  }

  try {
    console.log("\n❌ Attempting to update user with empty data...");
    await basicUsersApi.updateUser(1, {}); // Empty update data
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`✅ Validation correctly caught error: ${error.message}`);
    }
  }

  console.log("\n✅ Demo completed!");
}

// Run the demo
main().catch(console.error);
