/// <reference lib="deno.unstable" />

import { crypto } from "std/crypto/mod.ts";
import { decode as decodeHex, encode as encodeHex } from "std/encoding/hex.ts";

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
  key: Uint8Array;
  iv: Uint8Array;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export const textEncode = (str: string) => textEncoder.encode(str);
export const textDecode = (bytes: Uint8Array) => textDecoder.decode(bytes);

const fromSavedAESKey = async ({ key, iv }: SavedAESKey): Promise<AESKey> => {
  const importedKey = await crypto.subtle.importKey(
    "raw",
    key.buffer,
    "AES-CBC",
    true,
    ["encrypt", "decrypt"],
  );
  return {
    key: importedKey,
    iv,
  };
};
let key: null | Promise<AESKey> = null;

const kv: Deno.Kv | null = await Deno?.openKv().catch((_err) => null);
const cryptoKey = ["deco", "secret_cryptokey"];

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
          key: rawKey,
          iv,
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

export const encryptToHex = async (value: string): Promise<string> => {
  const { key, iv } = await getOrGenerateKey();

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    textEncode(value),
  );
  const encryptedBytes = new Uint8Array(encrypted);
  return textDecode(encodeHex(encryptedBytes));
};

export const decryptFromHex = async (encrypted: string) => {
  const { key, iv } = await getOrGenerateKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    key,
    decodeHex(textEncode(encrypted)),
  );
  const decryptedBytes = new Uint8Array(decrypted);
  return { decrypted: textDecode(decryptedBytes) };
};
