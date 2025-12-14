// compat/url.ts
// URL utilities for file:// URL handling

import { isDeno } from "./detect.ts";

/**
 * Convert a file path to a file:// URL
 * Works consistently across Deno, Node.js, and Bun
 */
export const toFileURL = (path: string): URL => {
  if (isDeno) {
    // Deno: handle both absolute and relative paths
    const absolutePath = path.startsWith("/") ? path : `/${path}`;
    return new URL(`file://${absolutePath}`);
  }

  // Node.js / Bun: use pathToFileURL if available
  try {
    // deno-lint-ignore no-explicit-any
    const url = (globalThis as any).require?.("node:url");
    if (url?.pathToFileURL) {
      return url.pathToFileURL(path);
    }
  } catch {
    // Fallback
  }

  // Fallback implementation
  const absolutePath = path.startsWith("/") ? path : `/${path}`;
  return new URL(`file://${absolutePath}`);
};

/**
 * Convert a file:// URL to a file path
 */
export const fromFileURL = (url: URL | string): string => {
  const urlObj = typeof url === "string" ? new URL(url) : url;

  if (urlObj.protocol !== "file:") {
    throw new Error(`Expected file:// URL, got ${urlObj.protocol}`);
  }

  if (isDeno) {
    // Remove file:// prefix and decode
    return decodeURIComponent(urlObj.pathname);
  }

  // Node.js / Bun
  try {
    // deno-lint-ignore no-explicit-any
    const url = (globalThis as any).require?.("node:url");
    if (url?.fileURLToPath) {
      return url.fileURLToPath(urlObj);
    }
  } catch {
    // Fallback
  }

  // Fallback
  return decodeURIComponent(urlObj.pathname);
};

