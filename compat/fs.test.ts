// compat/fs.test.ts
// Tests for filesystem abstraction

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fs } from "./fs.ts";
import { proc } from "./process.ts";
import { join } from "node:path";

describe("Filesystem Abstraction", () => {
  const TEST_DIR = join(proc.cwd(), ".deco-compat-test");
  const TEST_FILE = join(TEST_DIR, "test-file.txt");
  const TEST_CONTENT = "Hello, deco compat layer!";
  const TEST_BINARY_FILE = join(TEST_DIR, "test-binary.bin");
  const TEST_BINARY_CONTENT = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"

  beforeAll(async () => {
    // Create test directory
    try {
      await fs.mkdir(TEST_DIR, { recursive: true });
    } catch {
      // Directory might already exist
    }
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.remove(TEST_DIR, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Text File Operations", () => {
    it("should write and read text files", async () => {
      await fs.writeTextFile(TEST_FILE, TEST_CONTENT);
      const content = await fs.readTextFile(TEST_FILE);
      expect(content).toBe(TEST_CONTENT);
    });

    it("should overwrite existing files", async () => {
      const newContent = "Updated content";
      await fs.writeTextFile(TEST_FILE, newContent);
      const content = await fs.readTextFile(TEST_FILE);
      expect(content).toBe(newContent);
    });
  });

  describe("Binary File Operations", () => {
    it("should write and read binary files", async () => {
      await fs.writeFile(TEST_BINARY_FILE, TEST_BINARY_CONTENT);
      const content = await fs.readFile(TEST_BINARY_FILE);
      expect(content).toBeInstanceOf(Uint8Array);
      expect(Array.from(content)).toEqual(Array.from(TEST_BINARY_CONTENT));
    });
  });

  describe("Directory Operations", () => {
    const NESTED_DIR = join(TEST_DIR, "nested", "deep");

    it("should create nested directories", async () => {
      await fs.mkdir(NESTED_DIR, { recursive: true });
      const exists = await fs.exists(NESTED_DIR);
      expect(exists).toBe(true);
    });

    it("should read directory contents", async () => {
      // Create some files
      await fs.writeTextFile(join(TEST_DIR, "file1.txt"), "content1");
      await fs.writeTextFile(join(TEST_DIR, "file2.txt"), "content2");

      const entries: string[] = [];
      for await (const entry of fs.readDir(TEST_DIR)) {
        if (entry.isFile) {
          entries.push(entry.name);
        }
      }

      expect(entries).toContain("file1.txt");
      expect(entries).toContain("file2.txt");
    });
  });

  describe("File Metadata", () => {
    it("should get file stats", async () => {
      await fs.writeTextFile(TEST_FILE, TEST_CONTENT);
      const stat = await fs.stat(TEST_FILE);

      expect(stat.isFile).toBe(true);
      expect(stat.isDirectory).toBe(false);
      expect(stat.size).toBeGreaterThan(0);
      expect(stat.mtime).toBeInstanceOf(Date);
    });

    it("should check if file exists", async () => {
      await fs.writeTextFile(TEST_FILE, TEST_CONTENT);
      const exists = await fs.exists(TEST_FILE);
      expect(exists).toBe(true);

      const notExists = await fs.exists(join(TEST_DIR, "nonexistent.txt"));
      expect(notExists).toBe(false);
    });
  });

  describe("File Removal", () => {
    it("should remove files", async () => {
      const fileToRemove = join(TEST_DIR, "to-remove.txt");
      await fs.writeTextFile(fileToRemove, "delete me");
      expect(await fs.exists(fileToRemove)).toBe(true);

      await fs.remove(fileToRemove);
      expect(await fs.exists(fileToRemove)).toBe(false);
    });
  });

  describe("Real Path", () => {
    it("should resolve real path", async () => {
      const realPath = await fs.realPath(TEST_DIR);
      expect(typeof realPath).toBe("string");
      expect(realPath.length).toBeGreaterThan(0);
    });
  });
});

