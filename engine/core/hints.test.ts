import expectedHints from "./hints.test.expected.json" assert { type: "json" };
import releaseJSON from "./hints.test.json" assert { type: "json" };

import { genHints, type ResolveHints } from "../../engine/core/hints.ts";
import type { Resolvable } from "../../engine/core/resolver.ts";
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
