export const alg = "RSASSA-PKCS1-v1_5";
export const hash = "SHA-256";

const PUBLIC_KEY_ENV_VAR = "ISSUE_JWT_PUBLIC_KEY";
const PRIVATE_KEY_ENV_VAR = "ISSUE_JWT_PRIVATE_KEY";

const generateKeyPair = async (): Promise<[JsonWebKey, JsonWebKey]> => {
  const keyPair: CryptoKeyPair = await crypto.subtle.generateKey(
    {
      name: alg,
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash,
    },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;

  return await Promise.all([
    crypto.subtle.exportKey("jwk", keyPair.publicKey) as Promise<JsonWebKey>,
    crypto.subtle.exportKey("jwk", keyPair.privateKey) as Promise<JsonWebKey>,
  ]);
};

export const parseJWK = (jwk: string): JsonWebKey => JSON.parse(atob(jwk));
export const importJWK = (
  jwk: JsonWebKey,
  usages?: KeyUsage[],
): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: alg, hash },
    true,
    usages ?? ["sign" as const],
  );

export const importJWKFromString = (
  jwk: string,
  usages?: KeyUsage[],
): Promise<CryptoKey> =>
  importJWK(
    parseJWK(jwk),
    usages,
  );

const getOrGenerateKeyPair = async (): Promise<[JsonWebKey, JsonWebKey]> => {
  const publicKeyEnvValue = Deno.env.get(PUBLIC_KEY_ENV_VAR);
  const privateKeyEnvValue = Deno.env.get(PRIVATE_KEY_ENV_VAR);
  if (!publicKeyEnvValue || !privateKeyEnvValue) {
    return await generateKeyPair();
  }
  return [
    parseJWK(publicKeyEnvValue),
    parseJWK(privateKeyEnvValue),
  ];
};
// Generate an RSA key pair
export let keys: null | Promise<[JsonWebKey, JsonWebKey]> = null;

export const setFromString = (publicKey: string, privateKey: string) => {
  if (!publicKey || !privateKey) {
    return;
  }
  keys ??= Promise.resolve([
    parseJWK(publicKey),
    parseJWK(privateKey),
  ]);
};

/**
 * Returns a tuple of [publicKey, privateKey] in a JsonWebKey format.
 */
export const getKeyPair = async (): Promise<[JsonWebKey, JsonWebKey]> => {
  keys ??= getOrGenerateKeyPair();
  return await keys;
};
