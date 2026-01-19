// compat/mod.ts
// Runtime compatibility layer - main entry point
// Provides cross-runtime abstractions for Deno, Node.js, and Bun

export * from "./types.ts";
export * from "./detect.ts";
export * from "./env.ts";
export * from "./process.ts";
export * from "./fs.ts";
export * from "./inspect.ts";
export * from "./crypto.ts";
export * from "./url.ts";
export * from "./serve.ts";

// Fresh runtime compat (for $fresh/runtime.ts imports)
export * from "./fresh.ts";

// Device detection (cross-runtime useDevice)
export * from "./device.ts";

// Client-side invoke (Runtime.invoke for loaders/actions)
export * from "./invoke.ts";

// Convenience re-exports for common operations
import { proc } from "./process.ts";
export const cwd = proc.cwd;
export const args = proc.args;
export const exit = proc.exit;

