// compat/url.test.ts
// Tests for URL utilities

import { describe, expect, it } from "vitest";
import { fromFileURL, toFileURL } from "./url.ts";

describe("URL Utilities", () => {
  describe("toFileURL", () => {
    it("should convert absolute path to file URL", () => {
      const path = "/home/user/project/file.ts";
      const url = toFileURL(path);

      expect(url).toBeInstanceOf(URL);
      expect(url.protocol).toBe("file:");
      expect(url.pathname).toContain("file.ts");
    });

    it("should handle paths with spaces", () => {
      const path = "/home/user/my project/file.ts";
      const url = toFileURL(path);

      expect(url.href).toContain("my%20project");
    });

    it("should handle Windows-style paths on Windows", () => {
      // This test adapts to the current platform
      if (process.platform === "win32") {
        const path = "C:\\Users\\test\\file.ts";
        const url = toFileURL(path);
        expect(url.protocol).toBe("file:");
      }
    });
  });

  describe("fromFileURL", () => {
    it("should convert file URL to path", () => {
      const url = new URL("file:///home/user/project/file.ts");
      const path = fromFileURL(url);

      expect(path).toContain("home");
      expect(path).toContain("user");
      expect(path).toContain("file.ts");
    });

    it("should handle URL string input", () => {
      const path = fromFileURL("file:///tmp/test.txt");
      expect(path).toContain("tmp");
      expect(path).toContain("test.txt");
    });

    it("should throw for non-file URLs", () => {
      expect(() => fromFileURL(new URL("https://example.com"))).toThrow();
    });

    it("should decode URL-encoded characters", () => {
      const url = new URL("file:///home/user/my%20project/file.ts");
      const path = fromFileURL(url);

      expect(path).toContain("my project");
    });
  });

  describe("roundtrip", () => {
    it("should preserve path through roundtrip conversion", () => {
      const originalPath = "/tmp/deco/test/file.ts";
      const url = toFileURL(originalPath);
      const recoveredPath = fromFileURL(url);

      // Path should be preserved (may have different format but same meaning)
      expect(recoveredPath).toContain("deco");
      expect(recoveredPath).toContain("test");
      expect(recoveredPath).toContain("file.ts");
    });
  });
});

