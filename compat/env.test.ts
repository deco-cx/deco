// compat/env.test.ts
// Tests for environment variables abstraction

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "./env.ts";

describe("Environment Variables", () => {
  const TEST_KEY = "DECO_COMPAT_TEST_VAR";
  const TEST_VALUE = "test_value_123";

  beforeEach(() => {
    // Clean up before each test
    if (env.has(TEST_KEY)) {
      // We can't delete env vars in the abstraction, so we set to empty
      env.set(TEST_KEY, "");
    }
  });

  afterEach(() => {
    // Clean up after each test
    if (env.has(TEST_KEY)) {
      env.set(TEST_KEY, "");
    }
  });

  it("should set and get environment variables", () => {
    env.set(TEST_KEY, TEST_VALUE);
    expect(env.get(TEST_KEY)).toBe(TEST_VALUE);
  });

  it("should return undefined for non-existent variables", () => {
    const result = env.get("NON_EXISTENT_VAR_12345");
    expect(result).toBeUndefined();
  });

  it("should check if a variable exists with has()", () => {
    env.set(TEST_KEY, TEST_VALUE);
    expect(env.has(TEST_KEY)).toBe(true);
    expect(env.has("NON_EXISTENT_VAR_12345")).toBe(false);
  });

  it("should return object from toObject()", () => {
    env.set(TEST_KEY, TEST_VALUE);
    const obj = env.toObject();
    expect(typeof obj).toBe("object");
    expect(obj[TEST_KEY]).toBe(TEST_VALUE);
  });

  it("should handle PATH environment variable", () => {
    // PATH should exist in all environments
    const path = env.get("PATH");
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
  });
});

