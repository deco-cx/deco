import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildEditorBridge,
  isEditorParentOriginAllowed,
} from "./editorBridge.ts";

Deno.test("isEditorParentOriginAllowed", async (t) => {
  const allowed = ["https://studio.decocms.com", "https://admin.deco.cx"];

  await t.step("admits an exact allowlisted origin", () => {
    assert(isEditorParentOriginAllowed("https://studio.decocms.com", allowed));
    assert(isEditorParentOriginAllowed("https://admin.deco.cx", allowed));
  });

  await t.step("admits local dev origins by shape, any port", () => {
    assert(isEditorParentOriginAllowed("http://localhost:4000", allowed));
    assert(isEditorParentOriginAllowed("http://127.0.0.1:8080", allowed));
    assert(isEditorParentOriginAllowed("https://app.localhost:3000", allowed));
    assert(
      isEditorParentOriginAllowed("https://local.studio.decocms.com", allowed),
    );
  });

  await t.step("rejects unknown, empty, and malformed origins", () => {
    assert(!isEditorParentOriginAllowed("https://evil.example", allowed));
    // Suffix confusion must not pass: evil-decocms.com is not decocms.com.
    assert(!isEditorParentOriginAllowed("https://evil-localhost.com", allowed));
    assert(!isEditorParentOriginAllowed("null", allowed)); // sandboxed iframe origin
    assert(!isEditorParentOriginAllowed("", allowed));
    assert(!isEditorParentOriginAllowed(null, allowed));
    assert(!isEditorParentOriginAllowed(undefined, allowed));
  });
});

Deno.test("buildEditorBridge", async (t) => {
  await t.step("registers a message listener gated to framed contexts", () => {
    const out = buildEditorBridge();
    assertStringIncludes(out, "<script>");
    assertStringIncludes(out, 'addEventListener("message"');
    // Only inside a frame — the inverse of the draft badge.
    assertStringIncludes(out, "window.top===window.self");
  });

  await t.step("bakes in the origin allowlist and the check", () => {
    const out = buildEditorBridge();
    assertStringIncludes(out, "https://studio.decocms.com");
    // The pure predicate is serialised in, not re-implemented as a string.
    assertStringIncludes(out, "isEditorParentOriginAllowed");
    assertStringIncludes(out, "ok(e.origin,ALLOWED)");
  });

  await t.step("accepts both the studio and legacy admin protocols", () => {
    const out = buildEditorBridge();
    assertStringIncludes(out, "visual-editor::activate");
    assertStringIncludes(out, "editor::inject");
    assertStringIncludes(out, "new Function(s)()");
  });

  await t.step("evaluates nothing before the origin gate", () => {
    const out = buildEditorBridge();
    // The origin check must precede reading the payload / eval.
    assertEquals(
      out.indexOf("ok(e.origin,ALLOWED)") < out.indexOf("new Function(s)()"),
      true,
    );
  });
});
