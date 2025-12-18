import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run compat tests - these are the Node.js compatibility tests
    include: ["compat/**/*.test.ts"],
    // Use Node.js environment
    environment: "node",
    // Global test timeout
    testTimeout: 10000,
    // Reporter
    reporters: ["verbose"],
  },
  // Resolve .ts files directly
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
  esbuild: {
    // Support TypeScript
    target: "node20",
  },
});

