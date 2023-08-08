/// <reference lib="deno.unstable" />

import { crypto } from "std/crypto/mod.ts";
import { Buffer } from "std/io/buffer.ts";

const generateKey = async (): Promise<CryptoKey> => {
  return await crypto.subtle.generateKey(
    { name: "AES-CBC", length: 128 },
    true,
    ["encrypt", "decrypt"],
  );
};

export interface AESKey {
  key: CryptoKey;
  iv: Uint8Array;
}

interface SavedAESKey {
  key: string;
  iv: string;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export const te = (s: string) => textEncoder.encode(s);
export const td = (d: Uint8Array) => textDecoder.decode(d);

function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
const fromSavedAESKey = async ({ key, iv }: SavedAESKey): Promise<AESKey> => {
  const importedKey = await crypto.subtle.importKey(
    "raw",
    base64ToArrayBuffer(key).buffer,
    "AES-CBC",
    true,
    ["encrypt", "decrypt"],
  );
  return {
    key: importedKey,
    iv: base64ToArrayBuffer(iv),
  };
};
let key: null | Promise<AESKey> = null;

const kv: Deno.Kv | null = await Deno?.openKv().catch((_err) => null);
const cryptoKey = ["deco", "cryptokey___"];

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
        const rawKey = new Uint8Array(
          await crypto.subtle.exportKey("raw", generatedKey),
        );
        const iv = crypto.getRandomValues(new Uint8Array(16));

        const res = await kv.atomic().set(cryptoKey, {
          key: btoa(new Buffer(rawKey).toString()),
          iv: btoa(new Buffer(iv).toString()),
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
