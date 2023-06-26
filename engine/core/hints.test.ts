import expectedHints from "./hints.test.expected.json" assert { type: "json" };
import releaseJSON from "./hints.test.json" assert { type: "json" };

import { genHints, ResolveHints } from "$live/engine/core/hints.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { assertEquals } from "std/testing/asserts.ts";

Deno.test("hints", async (t) => {
  const resolvableMap: Record<string, Resolvable> = releaseJSON;

  await t.step("should be properly generated", () => {
    assertEquals(
      genHints(resolvableMap),
      expectedHints as ResolveHints,
    );
  });
});
