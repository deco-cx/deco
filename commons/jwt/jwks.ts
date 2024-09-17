import type { JwtPayloadWithClaims } from "./jwt.ts";
import { importJWK, importJWKFromString } from "./keys.ts";

export interface JwksIssuer {
  verifyWith: <
    TClaims extends Record<string, unknown> = Record<string, unknown>,
  >(
    cb: (key: CryptoKey) => Promise<JwtPayloadWithClaims<TClaims>>,
  ) => Promise<JwtPayloadWithClaims<TClaims>>;
}

export interface JwksIssuerOptions {
  fallbackPublicKey?: string;
  remoteAddress?: string;
  kid?: string;
}

export interface JwksKeys {
  keys: Array<JsonWebKey & { kid: string }>;
}
const fetchKeyFromAddr = async (
  address: string | undefined,
  kid?: string,
): Promise<CryptoKey | null> => {
  if (!address) {
    return null;
  }
  const response = await fetch(address);
  if (!response.ok) {
    return null;
  }
  const { keys = [] } = await response.json() as JwksKeys;
  const key = kid ? keys.find((key) => key?.kid === kid) ?? keys[0] : keys[0];
  if (!key) {
    return null;
  }
  return importJWK(key, ["verify"]);
};

/**
 * Returns a JwksIssuer that can be used to verify JWTs
 * If remoteAddress is not passed fallbackPublicKey will be used. If both are passed so first a fetch is tried then fallbackPublicKey is used.
 */
export const newTrustedJwksIssuer = (
  { fallbackPublicKey, remoteAddress, kid }: JwksIssuerOptions,
): JwksIssuer => {
  let fallbackKey: Promise<CryptoKey> | null = null;
  let currentKey: Promise<CryptoKey | null> | null = null;
  return {
    verifyWith: async (cb) => {
      currentKey ??= fetchKeyFromAddr(remoteAddress, kid);
      const key = await currentKey.then((c) => {
        if (c === null && fallbackPublicKey) {
          fallbackKey ??= importJWKFromString(fallbackPublicKey, ["verify"]);
          return fallbackKey;
        }
        return c;
      });
      if (key === null) {
        throw new Error("none of the provided keys are available");
      }
      try {
        return cb(key);
      } catch (err) { // if an error was thrown maybe the key was rotated so we should refetch it
        const currKey = await currentKey;
        if (currKey !== null) { // means that the has been used
          currentKey = fetchKeyFromAddr(remoteAddress, kid);
          const newKey = await currentKey;
          if (newKey) {
            return cb(newKey);
          }
        }
        throw err;
      }
    },
  };
};
