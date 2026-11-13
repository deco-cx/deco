/**
 * Helpers to keep secret material out of anything served to clients.
 *
 * A secret-shaped value in the decofile is either an unresolved secret block
 * (`{ __resolveType: ".../secret.ts", encrypted, name }`) or a resolved
 * `Secret` (`{ get: () => string | null }`). The ciphertext + the plaintext
 * env-var `name` are secret material, and endpoints like `/.decofile` are
 * reachable unauthenticated, so neither has any place in a served body.
 * Secrets resolve server-side at runtime from the env, never from the served
 * file, so stripping them does not affect rendering.
 */
export const isSecretValue = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  // Resolved Secret: an object whose only own key is a `get` function.
  if (typeof o.get === "function" && Object.keys(o).length === 1) return true;
  // Unresolved secret block. Match the actual secret-loader suffix
  // (`.../secret.ts` and the deprecated `.../secretString.ts`), not any
  // `__resolveType` that merely contains "secret" — otherwise legitimate
  // blocks like `.../secretary.ts` or a `Secret`-named section would be
  // dropped from the served decofile.
  const rt = o.__resolveType;
  return typeof rt === "string" && /(?:^|\/)secret(?:String)?\.ts$/i.test(rt);
};

/** `JSON.stringify` that drops any secret-shaped value anywhere in the tree. */
export const stringifyWithoutSecrets = (value: unknown): string =>
  JSON.stringify(value, (_key, v) => (isSecretValue(v) ? undefined : v));
