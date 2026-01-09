/**
 * Fresh Runtime Compat
 * Provides Fresh-like runtime utilities that work across Deno, Node.js, and Bun
 * Import this as "$fresh/runtime.ts" via module aliasing
 */

export const IS_BROWSER = typeof document !== "undefined";
export const IS_SERVER = !IS_BROWSER;

// Asset helper - returns path as-is (can be enhanced for asset fingerprinting)
export function asset(path: string): string {
  return path;
}

// Head component placeholder (actual implementation in islands/framework)
export function Head(_props: { children?: unknown }): null {
  return null;
}

// Partial component placeholder
export function Partial(_props: {
  name: string;
  children?: unknown;
}): unknown {
  return null;
}

// Re-export signal from @preact/signals for convenience
export { signal } from "@preact/signals";

