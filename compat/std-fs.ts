/**
 * Shim for @std/fs
 * Provides filesystem utilities compatible with Deno's std/fs
 */

import { existsSync as nodeExistsSync, mkdirSync, writeFileSync, readdirSync, statSync, readFileSync } from "node:fs";
import { mkdir, writeFile, readdir, stat, access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";

/**
 * Check if a file or directory exists synchronously
 */
export function existsSync(path: string): boolean {
  try {
    return nodeExistsSync(path);
  } catch {
    return false;
  }
}

/**
 * Check if a file or directory exists
 */
export async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
}

/**
 * Ensure a directory exists synchronously
 */
export function ensureDirSync(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
}

/**
 * Ensure a file exists, creating it and parent directories if necessary
 */
export async function ensureFile(filePath: string): Promise<void> {
  await ensureDir(dirname(filePath));
  try {
    await access(filePath, constants.F_OK);
  } catch {
    await writeFile(filePath, "");
  }
}

/**
 * Ensure a file exists synchronously
 */
export function ensureFileSync(filePath: string): void {
  ensureDirSync(dirname(filePath));
  try {
    nodeExistsSync(filePath);
  } catch {
    writeFileSync(filePath, "");
  }
}

export interface WalkEntry {
  path: string;
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface WalkOptions {
  maxDepth?: number;
  includeFiles?: boolean;
  includeDirs?: boolean;
  includeSymlinks?: boolean;
  followSymlinks?: boolean;
  exts?: string[];
  match?: RegExp[];
  skip?: RegExp[];
}

/**
 * Walk a directory tree yielding each entry
 */
export async function* walk(
  root: string,
  options: WalkOptions = {},
): AsyncIterableIterator<WalkEntry> {
  const {
    maxDepth = Infinity,
    includeFiles = true,
    includeDirs = true,
    includeSymlinks = true,
    exts,
    match,
    skip,
  } = options;

  async function* walkDir(dir: string, depth: number): AsyncIterableIterator<WalkEntry> {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(dir, entry.name);
      const relativePath = relative(root, path);

      // Skip patterns
      if (skip?.some((pattern) => pattern.test(relativePath))) {
        continue;
      }

      const walkEntry: WalkEntry = {
        path,
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
        isSymlink: entry.isSymbolicLink(),
      };

      // Check extensions filter
      if (exts && walkEntry.isFile) {
        const hasExt = exts.some((ext) => entry.name.endsWith(ext));
        if (!hasExt) continue;
      }

      // Check match patterns
      if (match && !match.some((pattern) => pattern.test(relativePath))) {
        continue;
      }

      if (walkEntry.isDirectory && includeDirs) {
        yield walkEntry;
      }

      if (walkEntry.isFile && includeFiles) {
        yield walkEntry;
      }

      if (walkEntry.isSymlink && includeSymlinks) {
        yield walkEntry;
      }

      if (walkEntry.isDirectory) {
        yield* walkDir(path, depth + 1);
      }
    }
  }

  yield* walkDir(root, 0);
}

/**
 * Walk a directory tree synchronously
 */
export function* walkSync(
  root: string,
  options: WalkOptions = {},
): IterableIterator<WalkEntry> {
  const {
    maxDepth = Infinity,
    includeFiles = true,
    includeDirs = true,
    includeSymlinks = true,
    exts,
    match,
    skip,
  } = options;

  function* walkDir(dir: string, depth: number): IterableIterator<WalkEntry> {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(dir, entry.name);
      const relativePath = relative(root, path);

      if (skip?.some((pattern) => pattern.test(relativePath))) {
        continue;
      }

      const walkEntry: WalkEntry = {
        path,
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
        isSymlink: entry.isSymbolicLink(),
      };

      if (exts && walkEntry.isFile) {
        const hasExt = exts.some((ext) => entry.name.endsWith(ext));
        if (!hasExt) continue;
      }

      if (match && !match.some((pattern) => pattern.test(relativePath))) {
        continue;
      }

      if (walkEntry.isDirectory && includeDirs) {
        yield walkEntry;
      }

      if (walkEntry.isFile && includeFiles) {
        yield walkEntry;
      }

      if (walkEntry.isSymlink && includeSymlinks) {
        yield walkEntry;
      }

      if (walkEntry.isDirectory) {
        yield* walkDir(path, depth + 1);
      }
    }
  }

  yield* walkDir(root, 0);
}

/**
 * Copy a file or directory
 */
export async function copy(src: string, dest: string): Promise<void> {
  const srcStat = await stat(src);

  if (srcStat.isDirectory()) {
    await ensureDir(dest);
    for await (const entry of walk(src, { maxDepth: 1 })) {
      if (entry.path !== src) {
        await copy(entry.path, join(dest, entry.name));
      }
    }
  } else {
    await ensureDir(dirname(dest));
    const content = await readFile(src);
    await writeFile(dest, content);
  }
}

/**
 * Move a file or directory
 */
export async function move(src: string, dest: string): Promise<void> {
  const { rename } = await import("node:fs/promises");
  try {
    await rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      // Cross-device move, copy then delete
      await copy(src, dest);
      const { rm } = await import("node:fs/promises");
      await rm(src, { recursive: true });
    } else {
      throw err;
    }
  }
}

/**
 * Empty a directory
 */
export async function emptyDir(dir: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      await rm(join(dir, entry), { recursive: true });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      await ensureDir(dir);
    } else {
      throw err;
    }
  }
}

