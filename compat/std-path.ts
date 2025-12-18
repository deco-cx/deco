/**
 * Shim for @std/path
 * Re-exports Node.js path module which is compatible
 */

import * as nodePath from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const {
  basename,
  delimiter,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  posix,
  relative,
  resolve,
  sep,
  win32,
} = nodePath;

// Deno-specific functions
export function toFileUrl(path: string): URL {
  return pathToFileURL(path);
}

export function fromFileUrl(url: string | URL): string {
  return fileURLToPath(url);
}

export const SEPARATOR = nodePath.sep;
export const SEPARATOR_PATTERN = nodePath.sep === "/" ? /\//g : /\\/g;

// Glob support (basic implementation)
export function globToRegExp(
  glob: string,
  options?: { extended?: boolean; globstar?: boolean },
): RegExp {
  const extended = options?.extended ?? true;
  const globstar = options?.globstar ?? true;

  let pattern = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape regex chars
    .replace(/\*/g, globstar ? ".*" : "[^/]*")
    .replace(/\?/g, extended ? "." : "\\?");

  return new RegExp(`^${pattern}$`);
}

export function isGlob(str: string): boolean {
  return /[*?[\]{}]/.test(str);
}

// Common utilities
export function common(paths: string[]): string {
  if (paths.length === 0) return "";
  if (paths.length === 1) return dirname(paths[0]);

  const [first, ...rest] = paths.map((p) => p.split(sep));
  const common: string[] = [];

  for (let i = 0; i < first.length; i++) {
    if (rest.every((p) => p[i] === first[i])) {
      common.push(first[i]);
    } else {
      break;
    }
  }

  return common.join(sep);
}

