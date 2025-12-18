// compat/fs.ts
// Filesystem abstraction

import type { DecoFS } from "./types.ts";
import { isDeno } from "./detect.ts";

declare const Deno: {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readDir(
    path: string,
  ): AsyncIterable<{ name: string; isFile: boolean; isDirectory: boolean }>;
  stat(
    path: string,
  ): Promise<{
    isFile: boolean;
    isDirectory: boolean;
    mtime: Date | null;
    size: number;
  }>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
  realPath(path: string): Promise<string>;
};

const denoFS: DecoFS = {
  readTextFile: (path) => Deno.readTextFile(path),
  writeTextFile: (path, content) => Deno.writeTextFile(path, content),
  readFile: (path) => Deno.readFile(path),
  writeFile: (path, data) => Deno.writeFile(path, data),
  readDir: (path) => Deno.readDir(path),
  stat: async (path) => {
    const stat = await Deno.stat(path);
    return {
      isFile: stat.isFile,
      isDirectory: stat.isDirectory,
      mtime: stat.mtime,
      size: stat.size,
    };
  },
  exists: async (path) => {
    try {
      await Deno.stat(path);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: (path, opts) => Deno.mkdir(path, opts),
  remove: (path, opts) => Deno.remove(path, opts),
  realPath: (path) => Deno.realPath(path),
};

// Node.js fs implementation using dynamic imports
// These work in both CommonJS and ESM environments

const nodeFSProxy: DecoFS = {
  readTextFile: async (path) => {
    const { readFile } = await import("node:fs/promises");
    return readFile(path, "utf-8");
  },
  writeTextFile: async (path, content) => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, content, "utf-8");
  },
  readFile: async (path) => {
    const { readFile } = await import("node:fs/promises");
    const buffer = await readFile(path);
    return new Uint8Array(buffer);
  },
  writeFile: async (path, data) => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, data);
  },
  readDir: async function* (path) {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      yield {
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      };
    }
  },
  stat: async (path) => {
    const { stat } = await import("node:fs/promises");
    const s = await stat(path);
    return {
      isFile: s.isFile(),
      isDirectory: s.isDirectory(),
      mtime: s.mtime,
      size: s.size,
    };
  },
  exists: async (path) => {
    const { access, constants } = await import("node:fs/promises");
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: async (path, opts) => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path, opts);
  },
  remove: async (path, opts) => {
    const { rm } = await import("node:fs/promises");
    await rm(path, opts);
  },
  realPath: async (path) => {
    const { realpath } = await import("node:fs/promises");
    return realpath(path);
  },
};

export const fs: DecoFS = isDeno ? denoFS : nodeFSProxy;

