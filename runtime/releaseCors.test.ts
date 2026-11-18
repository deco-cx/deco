import { assertEquals } from "@std/assert";
import { releaseCorsHeaders } from "./releaseCors.ts";

const allowOrigin = (origin: string | null, runtimeIsLocal: boolean) =>
  releaseCorsHeaders(origin, runtimeIsLocal)["Access-Control-Allow-Origin"];

const STUDIO = ["https://studio.decocms.com", "https://studio-stg.decocms.com"];
const TRUSTED = ["https://admin.deco.cx", "http://localhost:3000"];
const OTHERS = [
  "https://example.com",
  "https://evil.studio.decocms.com",
  "https://studio.decocms.com.evil.io",
  "https://admin.deco.cx.evil.io",
];

Deno.test("releaseCorsHeaders", async (t) => {
  await t.step(
    "a local runtime allows Studio and the trusted authorities",
    () => {
      for (const origin of [...STUDIO, ...TRUSTED]) {
        assertEquals(allowOrigin(origin, true), origin);
      }
    },
  );

  await t.step("a deployed runtime allows only the trusted authorities", () => {
    for (const origin of TRUSTED) {
      assertEquals(allowOrigin(origin, false), origin);
    }
    for (const origin of STUDIO) {
      assertEquals(releaseCorsHeaders(origin, false), {});
    }
  });

  await t.step("other origins get no CORS headers", () => {
    for (const local of [true, false]) {
      for (const origin of [...OTHERS, null, "null", "not a url"]) {
        assertEquals(releaseCorsHeaders(origin, local), {});
      }
    }
  });
});
