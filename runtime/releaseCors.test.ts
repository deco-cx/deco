import { assertEquals } from "@std/assert";
import { releaseCorsHeaders } from "./releaseCors.ts";

const allowOrigin = (origin: string | null, runtimeIsLocal: boolean) =>
  releaseCorsHeaders(origin, runtimeIsLocal)["Access-Control-Allow-Origin"];

Deno.test("releaseCorsHeaders", async (t) => {
  await t.step("a local runtime allows any origin", () => {
    for (
      const origin of [
        "https://studio.decocms.com",
        "https://studio-stg.decocms.com",
        "https://example.com",
      ]
    ) {
      assertEquals(allowOrigin(origin, true), origin);
    }
  });

  await t.step("a deployed runtime allows only the trusted authorities", () => {
    assertEquals(
      allowOrigin("https://admin.deco.cx", false),
      "https://admin.deco.cx",
    );
    assertEquals(
      allowOrigin("http://localhost:3000", false),
      "http://localhost:3000",
    );
    assertEquals(releaseCorsHeaders("https://studio.decocms.com", false), {});
    assertEquals(releaseCorsHeaders("https://example.com", false), {});
    assertEquals(
      releaseCorsHeaders("https://admin.deco.cx.evil.io", false),
      {},
    );
  });

  await t.step("no CORS headers without a parseable origin", () => {
    for (const local of [true, false]) {
      assertEquals(releaseCorsHeaders(null, local), {});
      assertEquals(releaseCorsHeaders("null", local), {});
      assertEquals(releaseCorsHeaders("not a url", local), {});
    }
  });
});
