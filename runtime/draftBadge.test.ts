import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { buildDraftBadge, injectBeforeBodyEnd } from "./draftBadge.ts";

Deno.test("buildDraftBadge", async (t) => {
  const P = "studio.decocms.com/api/fila/decofile/vm-1/main?token=tok.abc@v1";

  await t.step("renders the pill, deco mark, and menu controls", () => {
    const out = buildDraftBadge(P);
    assertStringIncludes(out, 'id="__deco-draft-badge"');
    assertStringIncludes(out, "Preview mode"); // pill label
    assertStringIncludes(out, "data:image/png;base64,"); // deco mark
    assertStringIncludes(out, "Exit preview");
    assertStringIncludes(out, "Share preview");
    assertStringIncludes(out, "data-exit");
    assertStringIncludes(out, "data-share");
  });

  await t.step("exit sets ?__draft=off; share pins the pointer", () => {
    const out = buildDraftBadge(P);
    assertStringIncludes(out, '"__draft","off"'); // exit
    assertStringIncludes(out, 'searchParams.set("__draft",p)'); // share
  });

  await t.step("starts hidden and reveals only when unframed", () => {
    const out = buildDraftBadge(P);
    // display:none in the container; the script flips it and bails inside iframes.
    assertStringIncludes(out, "display:none");
    assertStringIncludes(out, "window.top!==window.self");
  });

  await t.step("embeds the pointer script-escaped, never as raw HTML", () => {
    const evil = "a.example/x?token=</script><img src=x>@v1";
    const out = buildDraftBadge(evil);
    // The raw closing tag must not appear — `<` is escaped to \u003c.
    assert(!out.includes("</script><img"));
    assertStringIncludes(out, "\\u003c/script\\u003e");
  });
});

Deno.test("injectBeforeBodyEnd", async (t) => {
  await t.step("injects before the first </body>", () => {
    assertEquals(
      injectBeforeBodyEnd("<body>hi</body>", "X"),
      "<body>hiX</body>",
    );
  });

  await t.step("falls back to </html> then append", () => {
    assertEquals(
      injectBeforeBodyEnd("<html>hi</html>", "X"),
      "<html>hiX</html>",
    );
    assertEquals(injectBeforeBodyEnd("plain", "X"), "plainX");
  });

  await t.step("uses the FIRST </body> (nested content can't shift it)", () => {
    assertEquals(
      injectBeforeBodyEnd("<body>a</body><body>b</body>", "X"),
      "<body>aX</body><body>b</body>",
    );
  });
});
