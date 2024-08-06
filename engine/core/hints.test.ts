import expectedHints from "./hints.test.expected.json" with { type: "json" };
import releaseJSON from "./hints.test.json" with { type: "json" };

import { assertEquals } from "@std/assert";
import { genHints, type ResolveHints } from "../../engine/core/hints.ts";
import type { Resolvable } from "../../engine/core/resolver.ts";

Deno.test("hints", async (t) => {
  const resolvableMap: Record<string, Resolvable> = releaseJSON;

  await t.step("should be properly generated", () => {
    assertEquals(
      genHints(resolvableMap),
      expectedHints as ResolveHints,
    );
  });
});
