/**
 * Shim for @std/assert
 * Provides assertion utilities compatible with Deno's std/assert
 */

export class AssertionError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "AssertionError";
  }
}

export function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) {
    throw new AssertionError(msg ?? "Assertion failed");
  }
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (!equal(actual, expected)) {
    throw new AssertionError(
      msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

export function assertNotEquals<T>(actual: T, expected: T, msg?: string): void {
  if (equal(actual, expected)) {
    throw new AssertionError(
      msg ?? `Expected ${JSON.stringify(actual)} to not equal ${JSON.stringify(expected)}`,
    );
  }
}

export function assertStrictEquals<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new AssertionError(
      msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

export function assertExists<T>(
  actual: T,
  msg?: string,
): asserts actual is NonNullable<T> {
  if (actual === undefined || actual === null) {
    throw new AssertionError(msg ?? `Expected value to exist`);
  }
}

export function assertInstanceOf<T extends new (...args: unknown[]) => unknown>(
  actual: unknown,
  expectedType: T,
  msg?: string,
): asserts actual is InstanceType<T> {
  if (!(actual instanceof expectedType)) {
    throw new AssertionError(
      msg ?? `Expected instance of ${expectedType.name}`,
    );
  }
}

export function assertThrows(
  fn: () => unknown,
  errorClass?: new (...args: unknown[]) => Error,
  msgIncludes?: string,
  msg?: string,
): Error {
  let error: Error | undefined;
  try {
    fn();
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
  }

  if (!error) {
    throw new AssertionError(msg ?? "Expected function to throw");
  }

  if (errorClass && !(error instanceof errorClass)) {
    throw new AssertionError(
      msg ?? `Expected error to be instance of ${errorClass.name}`,
    );
  }

  if (msgIncludes && !error.message.includes(msgIncludes)) {
    throw new AssertionError(
      msg ?? `Expected error message to include "${msgIncludes}"`,
    );
  }

  return error;
}

export async function assertRejects(
  fn: () => Promise<unknown>,
  errorClass?: new (...args: unknown[]) => Error,
  msgIncludes?: string,
  msg?: string,
): Promise<Error> {
  let error: Error | undefined;
  try {
    await fn();
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
  }

  if (!error) {
    throw new AssertionError(msg ?? "Expected promise to reject");
  }

  if (errorClass && !(error instanceof errorClass)) {
    throw new AssertionError(
      msg ?? `Expected error to be instance of ${errorClass.name}`,
    );
  }

  if (msgIncludes && !error.message.includes(msgIncludes)) {
    throw new AssertionError(
      msg ?? `Expected error message to include "${msgIncludes}"`,
    );
  }

  return error;
}

export function assertArrayIncludes<T>(
  actual: ArrayLike<T>,
  expected: ArrayLike<T>,
  msg?: string,
): void {
  const missing: T[] = [];
  for (let i = 0; i < expected.length; i++) {
    let found = false;
    for (let j = 0; j < actual.length; j++) {
      if (equal(expected[i], actual[j])) {
        found = true;
        break;
      }
    }
    if (!found) {
      missing.push(expected[i]);
    }
  }

  if (missing.length > 0) {
    throw new AssertionError(
      msg ?? `Array does not include: ${JSON.stringify(missing)}`,
    );
  }
}

export function assertStringIncludes(
  actual: string,
  expected: string,
  msg?: string,
): void {
  if (!actual.includes(expected)) {
    throw new AssertionError(
      msg ?? `Expected "${actual}" to include "${expected}"`,
    );
  }
}

export function assertMatch(actual: string, expected: RegExp, msg?: string): void {
  if (!expected.test(actual)) {
    throw new AssertionError(
      msg ?? `Expected "${actual}" to match ${expected}`,
    );
  }
}

export function assertNotMatch(actual: string, expected: RegExp, msg?: string): void {
  if (expected.test(actual)) {
    throw new AssertionError(
      msg ?? `Expected "${actual}" to not match ${expected}`,
    );
  }
}

export function fail(msg?: string): never {
  throw new AssertionError(msg ?? "Test failed");
}

export function unimplemented(msg?: string): never {
  throw new AssertionError(msg ?? "Unimplemented");
}

export function unreachable(): never {
  throw new AssertionError("Unreachable code reached");
}

/**
 * Deep equality comparison
 */
export function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => equal(item, b[index]));
    }

    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }

    if (a instanceof RegExp && b instanceof RegExp) {
      return a.toString() === b.toString();
    }

    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false;
      for (const [key, value] of a) {
        if (!b.has(key) || !equal(value, b.get(key))) return false;
      }
      return true;
    }

    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false;
      for (const item of a) {
        if (!b.has(item)) return false;
      }
      return true;
    }

    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (
        !keysB.includes(key) ||
        !equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      ) {
        return false;
      }
    }

    return true;
  }

  return false;
}
