// compat/crypto.ts
// Crypto abstraction - uses Web Crypto API (available in all runtimes)

/**
 * Generate a random UUID using Web Crypto API
 */
export const cryptoRandomUUID = (): string => {
  return crypto.randomUUID();
};

/**
 * Fill array with random values using Web Crypto API
 */
export const cryptoGetRandomValues = <T extends ArrayBufferView>(
  array: T,
): T => {
  return crypto.getRandomValues(array);
};

/**
 * Web Crypto subtle interface - available in all modern runtimes
 */
export const subtle = crypto.subtle;

/**
 * Generate random bytes
 */
export const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

/**
 * Convert bytes to hex string
 */
export const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Convert hex string to bytes
 */
export const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

