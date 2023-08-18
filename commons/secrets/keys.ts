/// <reference lib="deno.unstable" />

import { crypto, decodeHex, encodeHex } from "../../deps.ts";

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

let kv: Deno.Kv | null = null;
try {
  kv = await Deno?.openKv().catch((_err) => null);
} catch {
  console.warn("please run with `--unstable` to enable deno kv support");
}
const cryptoKey = ["deco", "secret_cryptokey"];

/**
 * The overall behavior here is to generate the key in the first use and then use it for the entire environment life (across deployments).
 * Essentially we try to retrieve the key from the memory and then fallback to KV using the following order.
 * 1. Use the in-memory key variable if available (which means it was retrieved at least once)
 * 2. If not, try fetch from KV (which means it was generated at least once)
 * 3. If not available, on KV so it needs to be generated. So we generate a new key and then try to atomically save it on KV.
 * in that way we avoid concurrency of two keys being saved/stored in memory at the same time.
 * 4. If any transaction error occur so we try to retrieve from KV again and use it for the entire isolate life.
 */
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

        const res = await kv!.atomic().set(cryptoKey, {
          key: rawKey,
          iv,
        }).check(keys)
          .commit();
        if (!res.ok) {
          return await kv!.get<SavedAESKey>(cryptoKey).then(({ value }) => {
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
