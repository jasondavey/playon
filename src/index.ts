/**
 * Simple API Design Demo
 * Demonstrates basic API concepts using Node.js built-in fetch
 */

import { ApiClient } from "./ApiClient.js";

// Example usage
async function main() {
  console.log("🚀 API Design Demo Starting...");

  // Example with JSONPlaceholder API
  const client = new ApiClient("https://jsonplaceholder.typicode.com");

  try {
    // GET request example with auto-generated correlation ID
    console.log("\n📥 Fetching posts...");
    const posts = await client.get<
      Array<{ id: number; title: string; body: string }>
    >("/posts?_limit=3");
    console.log(`Retrieved ${posts.length} posts:`);
    posts.forEach((post) => console.log(`- ${post.title}`));

    // POST request example with custom correlation ID
    console.log("\n📤 Creating a new post...");
    const customCorrelationId = "demo-post-creation-001";
    const newPost = await client.post<{
      id: number;
      title: string;
      body: string;
    }>(
      "/posts",
      {
        title: "API Design Demo",
        body: "This is a demo of API design concepts using TypeScript and Node.js fetch",
        userId: 1,
      },
      customCorrelationId
    );
    console.log(`Created post with ID: ${newPost.id}`);
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
