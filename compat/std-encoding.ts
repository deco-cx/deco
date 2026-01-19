/**
 * Shim for @std/encoding
 * Provides encoding utilities
 */

/**
 * Encode a Uint8Array to hexadecimal string
 */
export function encodeHex(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Decode a hexadecimal string to Uint8Array
 */
export function decodeHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Encode a Uint8Array to base64 string
 */
export function encodeBase64(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  if (typeof btoa === "function") {
    return btoa(String.fromCharCode(...bytes));
  }
  return Buffer.from(bytes).toString("base64");
}

/**
 * Decode a base64 string to Uint8Array
 */
export function decodeBase64(base64: string): Uint8Array {
  if (typeof atob === "function") {
    return new Uint8Array(
      atob(base64)
        .split("")
        .map((c) => c.charCodeAt(0)),
    );
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Encode a Uint8Array to base64url string (URL-safe base64)
 */
export function encodeBase64Url(data: Uint8Array | ArrayBuffer): string {
  return encodeBase64(data)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode a base64url string to Uint8Array
 */
export function decodeBase64Url(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return decodeBase64(base64);
}

/**
 * Encode a string to Uint8Array using UTF-8
 */
export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Decode a Uint8Array to string using UTF-8
 */
export function decodeUtf8(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

