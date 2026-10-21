import { assertEquals } from "@std/assert";
import { mayReadDecofile } from "./corsPolicy.ts";

Deno.test("mayReadDecofile", async (t) => {
  await t.step("allows the CMS surfaces on `adminDomains`", () => {
    // Studio is on `adminDomains` but NOT on the decofile-authority list, so
    // it only reads `/.decofile` because this policy honours both.
    assertEquals(mayReadDecofile("https://studio.decocms.com"), true);
    assertEquals(mayReadDecofile("https://admin.deco.cx"), true);
  });

  await t.step("allows the decofile authorities", () => {
    assertEquals(mayReadDecofile("https://configs.decocdn.com"), true);
    assertEquals(mayReadDecofile("http://localhost:8000"), true);
  });

  await t.step("rejects anything on neither list", () => {
    assertEquals(mayReadDecofile("https://evil.example.com"), false);
    // A lookalike host is not a suffix match.
    assertEquals(mayReadDecofile("https://notstudio.decocms.com"), false);
  });

  await t.step("rejects a missing or unparseable origin", () => {
    assertEquals(mayReadDecofile(null), false);
    assertEquals(mayReadDecofile(""), false);
    assertEquals(mayReadDecofile("not an origin"), false);
  });

  await t.step("matches admin surfaces on full origin, not hostname", () => {
    // `adminDomains` holds origins: plain http never inherits the https entry.
    assertEquals(mayReadDecofile("http://studio.decocms.com"), false);
  });
});
