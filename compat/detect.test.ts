// compat/detect.test.ts
// Tests for runtime detection

import { describe, expect, it } from "vitest";
import { isBun, isDeno, isNode, runtime } from "./detect.ts";

describe("Runtime Detection", () => {
  it("should detect exactly one runtime as true", () => {
    const runtimes = [isDeno, isBun, isNode];
    const trueCount = runtimes.filter(Boolean).length;
    expect(trueCount).toBe(1);
  });

  it("should have runtime string match the detection", () => {
    if (isDeno) {
      expect(runtime).toBe("deno");
    } else if (isBun) {
      expect(runtime).toBe("bun");
    } else if (isNode) {
      expect(runtime).toBe("node");
    }
  });

  it("should detect Node.js when running in Node", () => {
    // When running via vitest with Node.js, isNode should be true
    // unless running in Deno or Bun
    if (typeof process !== "undefined" && !isDeno && !isBun) {
      expect(isNode).toBe(true);
      expect(runtime).toBe("node");
    }
  });

  it("runtime should be one of the valid values", () => {
    expect(["deno", "bun", "node"]).toContain(runtime);
  });
});

