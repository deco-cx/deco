/// <reference lib="deno.unstable" />

import { crypto } from "std/crypto/mod.ts";
export const alg = "RSASSA-PKCS1-v1_5";
export const hash = "SHA-256";

const generateKey = async (): Promise<CryptoKey> => {
  return await crypto.subtle.generateKey(
    { name: "AES-CBC", length: 128 },
    true,
    ["encrypt", "decrypt"],
  );
};

const importJWK = (
  jwk: JsonWebKey,
  usages?: string[],
): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    // @ts-ignore: for some reason deno is complaning about importing jwk's but it follows the crypto spec.
    "jwk",
    jwk,
    { name: alg, hash },
    true,
    usages ?? ["encrypt"],
  );

export interface AESKey {
  key: CryptoKey;
  iv: Uint8Array;
}

interface SavedAESKey {
  key: JsonWebKey;
  iv: string;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export const te = (s: string) => textEncoder.encode(s);
export const td = (d: Uint8Array) => textDecoder.decode(d);

const fromSavedAESKey = async ({ key, iv }: SavedAESKey): Promise<AESKey> => {
  return {
    key: await importJWK(key, ["encrypt", "decrypt"]),
    iv: te(iv),
  };
};
let key: null | Promise<AESKey> = null;

const kv: Deno.Kv | null = await Deno?.openKv().catch((_err) => null);
const cryptoKey = ["deco", "cryptokey"];

export const getOrGenerateKey = (): Promise<AESKey> => {
  if (key) {
    return key;
  }
  if (!kv) {
    throw new Error("could not generate keys, kv is not available.");
  }

  return key ??= kv.get<SavedAESKey>(cryptoKey).then(
    async (keys) => {
      const keyFromKv = keys.value;
      if (keyFromKv === null) {
        const generatedKey = await generateKey();
        const jwk = await crypto.subtle.exportKey(
          "jwk",
          generatedKey,
        );
        const iv = crypto.getRandomValues(new Uint8Array(16));

        const res = await kv.atomic().set(cryptoKey, {
          key: jwk,
          iv: td(iv),
        }).check(keys)
          .commit();
        if (!res.ok) {
          return await kv.get<SavedAESKey>(cryptoKey).then(({ value }) => {
            if (!value) {
              throw new Error("could not generate keys, kv is not available.");
            }
            return fromSavedAESKey(value);
          });
        }

        return { key: generatedKey, iv };
      }
      return fromSavedAESKey(keyFromKv);
    },
  );
};
