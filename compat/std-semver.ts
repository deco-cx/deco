/**
 * Shim for @std/semver
 * Provides semver utilities
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: (string | number)[];
  build?: string[];
}

/**
 * Parse a semver string into components
 */
export function parse(version: string): SemVer | null {
  const match = version.match(
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?(?:\+([a-zA-Z0-9.]+))?$/,
  );

  if (!match) return null;

  const [, major, minor, patch, prerelease, build] = match;

  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
    prerelease: prerelease?.split(".").map((p) => /^\d+$/.test(p) ? parseInt(p, 10) : p),
    build: build?.split("."),
  };
}

/**
 * Format a SemVer object as a string
 */
export function format(semver: SemVer): string {
  let result = `${semver.major}.${semver.minor}.${semver.patch}`;
  if (semver.prerelease?.length) {
    result += `-${semver.prerelease.join(".")}`;
  }
  if (semver.build?.length) {
    result += `+${semver.build.join(".")}`;
  }
  return result;
}

/**
 * Compare two semver versions
 * Returns -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compare(a: SemVer | string, b: SemVer | string): number {
  const semverA = typeof a === "string" ? parse(a) : a;
  const semverB = typeof b === "string" ? parse(b) : b;

  if (!semverA || !semverB) return 0;

  if (semverA.major !== semverB.major) {
    return semverA.major > semverB.major ? 1 : -1;
  }
  if (semverA.minor !== semverB.minor) {
    return semverA.minor > semverB.minor ? 1 : -1;
  }
  if (semverA.patch !== semverB.patch) {
    return semverA.patch > semverB.patch ? 1 : -1;
  }

  // Prerelease comparison
  const preA = semverA.prerelease || [];
  const preB = semverB.prerelease || [];

  if (preA.length === 0 && preB.length > 0) return 1;
  if (preA.length > 0 && preB.length === 0) return -1;

  for (let i = 0; i < Math.max(preA.length, preB.length); i++) {
    if (preA[i] === undefined) return -1;
    if (preB[i] === undefined) return 1;
    if (preA[i] !== preB[i]) {
      return preA[i] > preB[i] ? 1 : -1;
    }
  }

  return 0;
}

export function gt(a: SemVer | string, b: SemVer | string): boolean {
  return compare(a, b) > 0;
}

export function gte(a: SemVer | string, b: SemVer | string): boolean {
  return compare(a, b) >= 0;
}

export function lt(a: SemVer | string, b: SemVer | string): boolean {
  return compare(a, b) < 0;
}

export function lte(a: SemVer | string, b: SemVer | string): boolean {
  return compare(a, b) <= 0;
}

export function eq(a: SemVer | string, b: SemVer | string): boolean {
  return compare(a, b) === 0;
}

export type ReleaseType =
  | "major"
  | "minor"
  | "patch"
  | "premajor"
  | "preminor"
  | "prepatch"
  | "prerelease";

/**
 * Increment a version by a release type
 */
export function increment(version: SemVer | string, type: ReleaseType): SemVer | null {
  const semver = typeof version === "string" ? parse(version) : { ...version };
  if (!semver) return null;

  switch (type) {
    case "major":
      semver.major++;
      semver.minor = 0;
      semver.patch = 0;
      semver.prerelease = undefined;
      break;
    case "minor":
      semver.minor++;
      semver.patch = 0;
      semver.prerelease = undefined;
      break;
    case "patch":
      semver.patch++;
      semver.prerelease = undefined;
      break;
    case "premajor":
      semver.major++;
      semver.minor = 0;
      semver.patch = 0;
      semver.prerelease = [0];
      break;
    case "preminor":
      semver.minor++;
      semver.patch = 0;
      semver.prerelease = [0];
      break;
    case "prepatch":
      semver.patch++;
      semver.prerelease = [0];
      break;
    case "prerelease":
      if (!semver.prerelease?.length) {
        semver.prerelease = [0];
      } else {
        const last = semver.prerelease[semver.prerelease.length - 1];
        if (typeof last === "number") {
          semver.prerelease[semver.prerelease.length - 1] = last + 1;
        } else {
          semver.prerelease.push(0);
        }
      }
      break;
  }

  return semver;
}

/**
 * Check if a version satisfies a range
 * Supports simple ranges: ^1.0.0, ~1.0.0, >=1.0.0, etc.
 */
export function satisfies(version: SemVer | string, range: string): boolean {
  const semver = typeof version === "string" ? parse(version) : version;
  if (!semver) return false;

  // Simple exact match
  if (!range.match(/[\^~<>=]/)) {
    return eq(semver, range);
  }

  // Caret range ^1.0.0 (compatible with)
  if (range.startsWith("^")) {
    const rangeVer = parse(range.slice(1));
    if (!rangeVer) return false;
    if (semver.major !== rangeVer.major) return false;
    return gte(semver, rangeVer);
  }

  // Tilde range ~1.0.0 (approximately)
  if (range.startsWith("~")) {
    const rangeVer = parse(range.slice(1));
    if (!rangeVer) return false;
    if (semver.major !== rangeVer.major) return false;
    if (semver.minor !== rangeVer.minor) return false;
    return gte(semver, rangeVer);
  }

  // >= range
  if (range.startsWith(">=")) {
    return gte(semver, range.slice(2));
  }

  // > range
  if (range.startsWith(">")) {
    return gt(semver, range.slice(1));
  }

  // <= range
  if (range.startsWith("<=")) {
    return lte(semver, range.slice(2));
  }

  // < range
  if (range.startsWith("<")) {
    return lt(semver, range.slice(1));
  }

  // = range
  if (range.startsWith("=")) {
    return eq(semver, range.slice(1));
  }

  return false;
}

