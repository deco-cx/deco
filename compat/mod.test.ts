// compat/mod.test.ts
// Integration tests for the complete compat layer

import { describe, expect, it } from "vitest";
import * as compat from "./mod.ts";

describe("Compat Module Exports", () => {
  it("should export runtime detection", () => {
    expect(compat.isDeno).toBeDefined();
    expect(compat.isBun).toBeDefined();
    expect(compat.isNode).toBeDefined();
    expect(compat.runtime).toBeDefined();
    expect(typeof compat.isDeno).toBe("boolean");
    expect(typeof compat.isBun).toBe("boolean");
    expect(typeof compat.isNode).toBe("boolean");
    expect(typeof compat.runtime).toBe("string");
  });

  it("should export environment utilities", () => {
    expect(compat.env).toBeDefined();
    expect(typeof compat.env.get).toBe("function");
    expect(typeof compat.env.has).toBe("function");
    expect(typeof compat.env.set).toBe("function");
    expect(typeof compat.env.toObject).toBe("function");
  });

  it("should export process utilities", () => {
    expect(compat.proc).toBeDefined();
    expect(typeof compat.proc.cwd).toBe("function");
    expect(typeof compat.proc.args).toBe("function");
    expect(typeof compat.proc.exit).toBe("function");
    expect(typeof compat.proc.pid).toBe("function");
  });

  it("should export filesystem utilities", () => {
    expect(compat.fs).toBeDefined();
    expect(typeof compat.fs.readTextFile).toBe("function");
    expect(typeof compat.fs.writeTextFile).toBe("function");
    expect(typeof compat.fs.readFile).toBe("function");
    expect(typeof compat.fs.writeFile).toBe("function");
    expect(typeof compat.fs.readDir).toBe("function");
    expect(typeof compat.fs.stat).toBe("function");
    expect(typeof compat.fs.exists).toBe("function");
    expect(typeof compat.fs.mkdir).toBe("function");
    expect(typeof compat.fs.remove).toBe("function");
    expect(typeof compat.fs.realPath).toBe("function");
  });

  it("should export inspect utility", () => {
    expect(compat.inspect).toBeDefined();
    expect(typeof compat.inspect).toBe("function");
  });

  it("should export crypto utilities", () => {
    expect(compat.cryptoRandomUUID).toBeDefined();
    expect(compat.cryptoGetRandomValues).toBeDefined();
    expect(compat.subtle).toBeDefined();
    expect(compat.randomBytes).toBeDefined();
    expect(compat.bytesToHex).toBeDefined();
    expect(compat.hexToBytes).toBeDefined();
  });

  it("should export URL utilities", () => {
    expect(compat.toFileURL).toBeDefined();
    expect(compat.fromFileURL).toBeDefined();
    expect(typeof compat.toFileURL).toBe("function");
    expect(typeof compat.fromFileURL).toBe("function");
  });

  it("should export serve utility", () => {
    expect(compat.serve).toBeDefined();
    expect(typeof compat.serve).toBe("function");
  });

  it("should export types", () => {
    // Types are checked at compile time, but we can verify the type exports work
    const envType: compat.DecoEnv = compat.env;
    const fsType: compat.DecoFS = compat.fs;
    const procType: compat.DecoProcess = compat.proc;
    const runtimeType: compat.Runtime = compat.runtime;

    expect(envType).toBe(compat.env);
    expect(fsType).toBe(compat.fs);
    expect(procType).toBe(compat.proc);
    expect(runtimeType).toBe(compat.runtime);
  });
});

describe("Compat Layer Integration", () => {
  it("should work together for file operations with env vars", async () => {
    const { env, fs, proc } = compat;
    const { join } = await import("node:path");

    // Set up test environment
    const testDir = join(proc.cwd(), ".deco-integration-test");
    const testFile = join(testDir, "test.txt");
    const testContent = `Runtime: ${compat.runtime}`;

    try {
      // Create directory and file
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeTextFile(testFile, testContent);

      // Verify file was created
      const exists = await fs.exists(testFile);
      expect(exists).toBe(true);

      // Read file back
      const content = await fs.readTextFile(testFile);
      expect(content).toBe(testContent);
      expect(content).toContain(compat.runtime);

      // Set an env var to track the test
      env.set("DECO_INTEGRATION_TEST_COMPLETE", "true");
      expect(env.get("DECO_INTEGRATION_TEST_COMPLETE")).toBe("true");
    } finally {
      // Cleanup
      try {
        await fs.remove(testDir, { recursive: true });
      } catch {
        // Ignore
      }
    }
  });

  it("should work together for crypto and inspect", () => {
    const { cryptoRandomUUID, inspect, bytesToHex, randomBytes } = compat;

    // Generate some crypto data
    const uuid = cryptoRandomUUID();
    const bytes = randomBytes(16);
    const hex = bytesToHex(bytes);

    // Inspect the data
    const inspected = inspect({
      uuid,
      hex,
      bytesLength: bytes.length,
    });

    expect(inspected).toContain(uuid);
    expect(inspected).toContain("hex");
    expect(inspected).toContain("16");
  });
});

