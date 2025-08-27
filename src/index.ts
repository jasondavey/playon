/**
 * Users API Design Demo
 * Demonstrates concrete User interface with CORS best practices and idempotency
 */

import {
  UsersApi,
  User,
  CreateUserData,
  UpdateUserData,
  CorsOptions,
  IdempotencyOptions,
} from "./UsersApi.js";

// Example usage
async function main() {
  console.log("🚀 Users API Design Demo Starting...");

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
    // GET all users
    console.log("\n👥 Fetching all users...");
    const users: User[] = await basicUsersApi.getUsers();
    console.log(`Retrieved ${users.length} users:`);
    users
      .slice(0, 3)
      .forEach((user) => console.log(`- ${user.name} (${user.email})`));

    // GET specific user
    console.log("\n👤 Fetching specific user...");
    const user: User = await basicUsersApi.getUser(1);
    console.log(`User: ${user.name} - ${user.email}`);

    // CREATE new user with automatic idempotency
    console.log("\n➕ Creating new user with automatic idempotency...");
    const newUserData: CreateUserData = {
      name: "John Doe",
      username: "johndoe",
      email: "john.doe@example.com",
      phone: "555-0123",
      website: "johndoe.dev",
    };
    const createdUser: User = await idempotentUsersApi.createUser(newUserData);
    console.log(`Created user with ID: ${createdUser.id}`);

    // UPDATE user with custom idempotency key
    console.log("\n🔄 Updating user with custom idempotency key...");
    const updateData: UpdateUserData = {
      name: "John Smith",
      email: "john.smith@example.com",
    };
    const customIdempotencyKey = "user-update-operation-12345";
    const updatedUser: User = await basicUsersApi.updateUser(
      1,
      updateData,
      "custom-correlation-id",
      customIdempotencyKey
    );
    console.log(`Updated user: ${updatedUser.name}`);

    // PATCH user (partial update)
    console.log("\n🔧 Partially updating user...");
    const patchData: UpdateUserData = {
      phone: "555-9999",
    };
    const patchedUser: User = await idempotentUsersApi.patchUser(1, patchData);
    console.log(`Patched user phone: ${patchedUser.phone || "N/A"}`);
  } catch (error) {
    console.error(
      "❌ API Error:",
      error instanceof Error ? error.message : error
    );
  }

  console.log("\n✅ Demo completed!");
}

// Run the demo
main().catch(console.error);
