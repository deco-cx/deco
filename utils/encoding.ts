import { encodeHex } from "@std/encoding/hex";

// Reuse TextEncoder instance to avoid repeated instantiation
const textEncoder = new TextEncoder();

/**
 * Takes an arbitrary string and converts to its sha256 hex representation.
 * @param str the string that will be converted
 * @returns the sha256 hex representation
 */
export const stringToHexSha256 = async (str: string): Promise<string> => {
  const encoded = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(JSON.stringify(str)),
  );
  return encodeHex(encoded);
};
