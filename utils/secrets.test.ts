import { assertEquals, assertStringIncludes } from "@std/assert";
import { isSecretValue, stringifyWithoutSecrets } from "./secrets.ts";

// `/.decofile` is reachable unauthenticated. An unresolved secret block
// discloses ciphertext AND the plaintext env-var name; a resolved Secret could
// leak plaintext. Neither must appear in anything served to clients.

Deno.test("isSecretValue matches secret-shaped values only", () => {
  assertEquals(
    isSecretValue({
      __resolveType: "website/loaders/secret.ts",
      encrypted: "deadbeef",
      name: "VTEX_APP_TOKEN",
    }),
    true,
  );
  assertEquals(isSecretValue({ get: () => "plaintext" }), true);
  // Deprecated secretString loader also returns plaintext — must still match.
  assertEquals(isSecretValue({ __resolveType: "website/loaders/secretString.ts" }), true);
  assertEquals(isSecretValue({ __resolveType: "site/loaders/secret.ts" }), true);
  assertEquals(isSecretValue({ __resolveType: "website/sections/Hero.tsx" }), false);
  assertEquals(isSecretValue({ get: () => 1, other: 2 }), false);
  assertEquals(isSecretValue("a string"), false);
  assertEquals(isSecretValue(null), false);
});

Deno.test("isSecretValue does not match on a mere 'secret' substring", () => {
  // Suffix match, not substring — these legitimate blocks must be preserved.
  assertEquals(isSecretValue({ __resolveType: "apps/foo/loaders/secretary.ts" }), false);
  assertEquals(isSecretValue({ __resolveType: "website/sections/SecretSanta.tsx" }), false);
  assertEquals(isSecretValue({ __resolveType: "mysecret/loaders/config.ts" }), false);
  assertEquals(isSecretValue({ __resolveType: "site/loaders/mysecret.ts" }), false);
});

Deno.test("stringifyWithoutSecrets drops ciphertext + env-var name", () => {
  const decofile = {
    Site: {
      name: "base",
      appToken: {
        __resolveType: "website/loaders/secret.ts",
        encrypted: "deadbeefcafef00d",
        name: "VTEX_APP_TOKEN",
      },
    },
    "pages-home": { path: "/" },
  };

  const body = stringifyWithoutSecrets(decofile);

  assertEquals(body.includes("deadbeefcafef00d"), false);
  assertEquals(body.includes("VTEX_APP_TOKEN"), false);
  assertEquals(body.includes("website/loaders/secret.ts"), false);

  const parsed = JSON.parse(body) as Record<string, any>;
  assertEquals(parsed.Site.name, "base");
  assertEquals(parsed.Site.appToken, undefined);
  assertEquals(parsed["pages-home"], { path: "/" });
});

Deno.test("stringifyWithoutSecrets drops resolved Secret objects", () => {
  const body = stringifyWithoutSecrets({ Site: { token: { get: () => "plaintext-secret" } } });
  assertEquals(body.includes("plaintext-secret"), false);
  assertEquals((JSON.parse(body) as Record<string, any>).Site.token, undefined);
});

Deno.test("stringifyWithoutSecrets preserves a normal decofile", () => {
  const decofile = { Site: { name: "x" }, "pages-home": { path: "/", sections: [] } };
  assertStringIncludes(stringifyWithoutSecrets(decofile), '"name":"x"');
  assertEquals(JSON.parse(stringifyWithoutSecrets(decofile)), decofile);
});
