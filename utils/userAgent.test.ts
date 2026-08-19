import { assertEquals } from "@std/assert";
import { deviceOf } from "./userAgent.ts";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const req = ({
  deviceHint,
  cf,
  ua,
}: {
  deviceHint?: string;
  cf?: string;
  ua?: string;
}) => {
  const url = deviceHint
    ? `https://example.com/?deviceHint=${deviceHint}`
    : "https://example.com/";
  const headers = new Headers();
  if (cf) headers.set("cf-device-type", cf);
  if (ua) headers.set("user-agent", ua);
  return new Request(url, { headers });
};

Deno.test("deviceOf", async (t) => {
  await t.step("deviceHint overrides cf-device-type (Cloudflare)", () => {
    // The Studio preview forces `deviceHint=mobile` while the requesting
    // browser is desktop; behind Cloudflare `cf-device-type` used to win.
    assertEquals(
      deviceOf(req({ deviceHint: "mobile", cf: "desktop", ua: DESKTOP_UA })),
      "mobile",
    );
  });

  await t.step("deviceHint overrides the user-agent device", () => {
    assertEquals(
      deviceOf(req({ deviceHint: "tablet", ua: MOBILE_UA })),
      "tablet",
    );
  });

  await t.step("falls back to cf-device-type when no deviceHint", () => {
    assertEquals(deviceOf(req({ cf: "mobile", ua: DESKTOP_UA })), "mobile");
  });

  await t.step("falls back to user-agent when no deviceHint nor cf", () => {
    assertEquals(deviceOf(req({ ua: MOBILE_UA })), "mobile");
  });

  await t.step("defaults to desktop", () => {
    assertEquals(deviceOf(req({ ua: DESKTOP_UA })), "desktop");
    assertEquals(deviceOf(req({})), "desktop");
  });

  await t.step("normalizes unsupported device types to desktop", () => {
    assertEquals(deviceOf(req({ deviceHint: "smarttv" })), "desktop");
  });
});
