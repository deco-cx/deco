// compat/crypto.test.ts
// Tests for crypto abstraction

import { describe, expect, it } from "vitest";
import {
  bytesToHex,
  cryptoGetRandomValues,
  cryptoRandomUUID,
  hexToBytes,
  randomBytes,
  subtle,
} from "./crypto.ts";

describe("Crypto Abstraction", () => {
  describe("cryptoRandomUUID", () => {
    it("should generate valid UUIDs", () => {
      const uuid = cryptoRandomUUID();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it("should generate unique UUIDs", () => {
      const uuids = new Set(Array.from({ length: 100 }, () => cryptoRandomUUID()));
      expect(uuids.size).toBe(100);
    });
  });

  describe("cryptoGetRandomValues", () => {
    it("should fill array with random values", () => {
      const arr = new Uint8Array(16);
      const result = cryptoGetRandomValues(arr);

      expect(result).toBe(arr);
      // Very unlikely all values are 0 after random fill
      expect(arr.some((v) => v !== 0)).toBe(true);
    });

    it("should work with different typed arrays", () => {
      const uint32 = new Uint32Array(4);
      cryptoGetRandomValues(uint32);
      expect(uint32.some((v) => v !== 0)).toBe(true);
    });
  });

  describe("randomBytes", () => {
    it("should generate random bytes of specified length", () => {
      const bytes16 = randomBytes(16);
      const bytes32 = randomBytes(32);

      expect(bytes16.length).toBe(16);
      expect(bytes32.length).toBe(32);
      expect(bytes16).toBeInstanceOf(Uint8Array);
    });

    it("should generate different values each time", () => {
      const bytes1 = randomBytes(32);
      const bytes2 = randomBytes(32);

      // Convert to string for comparison
      const str1 = Array.from(bytes1).join(",");
      const str2 = Array.from(bytes2).join(",");

      expect(str1).not.toBe(str2);
    });
  });

  describe("bytesToHex and hexToBytes", () => {
    it("should convert bytes to hex and back", () => {
      const original = new Uint8Array([0x00, 0x11, 0x22, 0xff, 0xab, 0xcd]);
      const hex = bytesToHex(original);
      const back = hexToBytes(hex);

      expect(hex).toBe("001122ffabcd");
      expect(Array.from(back)).toEqual(Array.from(original));
    });

    it("should handle empty arrays", () => {
      const empty = new Uint8Array(0);
      const hex = bytesToHex(empty);
      const back = hexToBytes(hex);

      expect(hex).toBe("");
      expect(back.length).toBe(0);
    });

    it("should handle single byte", () => {
      const single = new Uint8Array([0x42]);
      const hex = bytesToHex(single);
      expect(hex).toBe("42");
    });
  });

  describe("subtle", () => {
    it("should expose Web Crypto subtle interface", () => {
      expect(subtle).toBeDefined();
      expect(typeof subtle.digest).toBe("function");
      expect(typeof subtle.encrypt).toBe("function");
      expect(typeof subtle.decrypt).toBe("function");
    });

    it("should compute SHA-256 hash", async () => {
      const data = new TextEncoder().encode("Hello, World!");
      const hash = await subtle.digest("SHA-256", data);

      expect(hash).toBeInstanceOf(ArrayBuffer);
      expect(hash.byteLength).toBe(32); // SHA-256 produces 32 bytes
    });
  });
});

