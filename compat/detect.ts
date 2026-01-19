// compat/detect.ts
// Runtime detection utilities

import type { Runtime } from "./types.ts";

// Type declarations for compile-time safety
declare const Deno: unknown;
declare const Bun: unknown;

export const isDeno = typeof Deno !== "undefined";
export const isBun = typeof Bun !== "undefined" && !isDeno;
export const isNode = !isDeno && !isBun && typeof process !== "undefined";

export const runtime: Runtime = isDeno ? "deno" : isBun ? "bun" : "node";

