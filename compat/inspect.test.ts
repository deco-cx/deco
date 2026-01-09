// compat/inspect.test.ts
// Tests for object inspection abstraction

import { describe, expect, it } from "vitest";
import { inspect } from "./inspect.ts";

describe("Object Inspection", () => {
  it("should inspect primitive values", () => {
    expect(inspect("hello")).toContain("hello");
    expect(inspect(42)).toContain("42");
    expect(inspect(true)).toContain("true");
    expect(inspect(null)).toContain("null");
  });

  it("should inspect objects", () => {
    const obj = { name: "test", value: 123 };
    const result = inspect(obj);
    expect(result).toContain("name");
    expect(result).toContain("test");
    expect(result).toContain("value");
    expect(result).toContain("123");
  });

  it("should inspect arrays", () => {
    const arr = [1, 2, 3, "four"];
    const result = inspect(arr);
    expect(result).toContain("1");
    expect(result).toContain("2");
    expect(result).toContain("3");
    expect(result).toContain("four");
  });

  it("should inspect nested objects", () => {
    const nested = {
      level1: {
        level2: {
          value: "deep",
        },
      },
    };
    const result = inspect(nested);
    expect(result).toContain("level1");
    expect(result).toContain("level2");
    expect(result).toContain("deep");
  });

  it("should inspect errors", () => {
    const error = new Error("Test error message");
    const result = inspect(error);
    expect(result).toContain("Error");
    expect(result).toContain("Test error message");
  });

  it("should handle circular references gracefully", () => {
    const circular: Record<string, unknown> = { name: "circular" };
    circular.self = circular;

    // Should not throw
    const result = inspect(circular);
    expect(typeof result).toBe("string");
  });

  it("should respect depth option", () => {
    const deep = {
      a: { b: { c: { d: { e: "deep" } } } },
    };
    const shallow = inspect(deep, { depth: 1 });
    const deeper = inspect(deep, { depth: 10 });

    // Both should be strings
    expect(typeof shallow).toBe("string");
    expect(typeof deeper).toBe("string");
  });
});

