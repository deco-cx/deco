// compat/env.ts
// Environment variables abstraction

import type { DecoEnv } from "./types.ts";
import { isDeno } from "./detect.ts";

// Deno types for compile-time safety
declare const Deno: {
  env: {
    get(key: string): string | undefined;
    has(key: string): boolean;
    set(key: string, value: string): void;
    toObject(): Record<string, string>;
  };
};

const denoEnv: DecoEnv = {
  get: (key) => Deno.env.get(key),
  has: (key) => Deno.env.has(key),
  set: (key, value) => Deno.env.set(key, value),
  toObject: () => Deno.env.toObject(),
};

const nodeEnv: DecoEnv = {
  get: (key) => process.env[key],
  has: (key) => key in process.env && process.env[key] !== undefined,
  set: (key, value) => {
    process.env[key] = value;
  },
  toObject: () => ({ ...process.env }) as Record<string, string | undefined>,
};

export const env: DecoEnv = isDeno ? denoEnv : nodeEnv;

