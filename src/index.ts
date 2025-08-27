/**
 * Simple API Design Demo
 * Demonstrates basic API concepts using Node.js built-in fetch with CORS best practices and idempotency
 */

import { ApiClient, CorsOptions, IdempotencyOptions } from "./ApiClient.js";

// Example usage
async function main() {
  console.log("🚀 API Design Demo Starting...");

  // Example 1: Basic client with default settings
  console.log("\n📋 Example 1: Basic client (no idempotency)");
  const basicClient = new ApiClient("https://jsonplaceholder.typicode.com");

  // Example 2: Client with idempotency enabled
  console.log("\n📋 Example 2: Client with automatic idempotency");
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

  const idempotentClient = new ApiClient(
    "https://jsonplaceholder.typicode.com",
    {},
    corsOptions,
    idempotencyOptions
  );

  try {
    // GET request example (idempotent by nature)
    console.log("\n📥 Fetching posts with basic client...");
    const posts = await basicClient.get<
      Array<{ id: number; title: string; body: string }>
    >("/posts?_limit=2");
    console.log(`Retrieved ${posts.length} posts:`);
    posts.forEach((post) => console.log(`- ${post.title}`));

    // POST request with automatic idempotency
    console.log("\n📤 Creating post with automatic idempotency...");
    const newPost1 = await idempotentClient.post<{
      id: number;
      title: string;
      body: string;
    }>("/posts", {
      title: "Idempotent API Demo",
      body: "This request uses automatic idempotency key generation",
      userId: 1,
    });
    console.log(`Created post with ID: ${newPost1.id}`);

    // POST request with custom idempotency key
    console.log("\n📤 Creating post with custom idempotency key...");
    const customIdempotencyKey = "user-action-payment-12345";
    const newPost2 = await basicClient.post<{
      id: number;
      title: string;
      body: string;
    }>(
      "/posts",
      {
        title: "Custom Idempotency Demo",
        body: "This request uses a custom idempotency key for critical operations",
        userId: 1,
      },
      "custom-correlation-id",
      customIdempotencyKey
    );
    console.log(`Created post with ID: ${newPost2.id}`);

    // PUT request with idempotency (for updates)
    console.log("\n🔄 Updating post with idempotency...");
    const updatedPost = await idempotentClient.put<{
      id: number;
      title: string;
      body: string;
    }>("/posts/1", {
      id: 1,
      title: "Updated Post with Idempotency",
      body: "This update operation is idempotent",
      userId: 1,
    });
    console.log(`Updated post: ${updatedPost.title}`);
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
