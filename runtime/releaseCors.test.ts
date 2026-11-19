import { assertEquals } from "@std/assert";
import { releaseCorsHeaders } from "./releaseCors.ts";

// Fixed here so the test does not depend on DECO_ALLOWED_AUTHORITIES.
const TRUSTED_AUTHORITIES = ["admin.deco.cx", "localhost"];

const corsHeaders = (origin: string | null, runtimeIsLocal: boolean) =>
  releaseCorsHeaders(origin, runtimeIsLocal, TRUSTED_AUTHORITIES);

const allowOrigin = (origin: string | null, runtimeIsLocal: boolean) =>
  corsHeaders(origin, runtimeIsLocal)["Access-Control-Allow-Origin"];

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
      assertEquals(corsHeaders(origin, false), {});
    }
  });

  await t.step("other origins get no CORS headers", () => {
    for (const local of [true, false]) {
      for (const origin of [...OTHERS, null, "null", "not a url"]) {
        assertEquals(corsHeaders(origin, local), {});
      }
    }
  });
});
