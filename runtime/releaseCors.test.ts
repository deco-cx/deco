import { assertEquals } from "@std/assert";
import { releaseCorsHeaders } from "./releaseCors.ts";

const allowOrigin = (origin: string | null) =>
  releaseCorsHeaders(origin)["Access-Control-Allow-Origin"];

Deno.test("releaseCorsHeaders", async (t) => {
  await t.step("allows Studio's editor origins", () => {
    assertEquals(
      allowOrigin("https://studio.decocms.com"),
      "https://studio.decocms.com",
    );
    assertEquals(
      allowOrigin("https://studio-stg.decocms.com"),
      "https://studio-stg.decocms.com",
    );
  });

  await t.step("keeps allowing the trusted authorities", () => {
    assertEquals(allowOrigin("https://admin.deco.cx"), "https://admin.deco.cx");
    assertEquals(allowOrigin("http://localhost:3000"), "http://localhost:3000");
  });

  await t.step("sends no CORS headers to other origins", () => {
    assertEquals(releaseCorsHeaders("https://example.com"), {});
    assertEquals(releaseCorsHeaders("https://evil.studio.decocms.com"), {});
    assertEquals(releaseCorsHeaders("https://studio.decocms.com.evil.io"), {});
  });

  await t.step("sends no CORS headers without a parseable origin", () => {
    assertEquals(releaseCorsHeaders(null), {});
    assertEquals(releaseCorsHeaders("null"), {});
    assertEquals(releaseCorsHeaders("not a url"), {});
  });
});
