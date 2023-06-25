import { encode } from "https://cdn.jsdelivr.net/gh/denoland/deno_std@0.190.0/encoding/hex.ts";

/**
 * Takes an arbitrary string and converts to its sha256 hex representation.
 * @param str the string that will be converted
 * @returns the sha256 hex representation
 */
export const stringToHexSha256 = async (str: string): Promise<string> => {
  const encoded = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(str)),
  );
  return new TextDecoder().decode(
    encode(new Uint8Array(encoded)),
  );
};
