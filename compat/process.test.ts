// compat/process.test.ts
// Tests for process abstraction

import { describe, expect, it } from "vitest";
import { proc } from "./process.ts";

describe("Process Abstraction", () => {
  it("should return current working directory", () => {
    const cwd = proc.cwd();
    expect(typeof cwd).toBe("string");
    expect(cwd.length).toBeGreaterThan(0);
    // Should be an absolute path
    expect(cwd.startsWith("/") || cwd.match(/^[A-Z]:\\/)).toBeTruthy();
  });

  it("should return command line arguments as array", () => {
    const args = proc.args();
    expect(Array.isArray(args)).toBe(true);
    // Arguments should all be strings
    args.forEach((arg) => {
      expect(typeof arg).toBe("string");
    });
  });

  it("should return a valid PID", () => {
    const pid = proc.pid();
    expect(typeof pid).toBe("number");
    expect(pid).toBeGreaterThan(0);
    expect(Number.isInteger(pid)).toBe(true);
  });

  it("proc.exit should be a function", () => {
    expect(typeof proc.exit).toBe("function");
    // We don't actually call exit as it would terminate the test process
  });
});

