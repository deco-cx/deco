import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { createRenderSigner } from "./renderSignature.ts";

const input = {
  props: JSON.stringify({
    component: "/components/Cart.tsx",
    __resolveType: "site/sections/Widget.tsx",
  }),
  pathTemplate: "/*",
};

Deno.test("render signature", async (t) => {
  const signer = createRenderSigner({ secret: "s3cret" });

  await t.step("accepts what it signed", () => {
    assertEquals(signer.verify(input, signer.sign(input)), { ok: true });
    const withChain = { ...input, resolveChain: '[{"t":"r","v":"x"}]' };
    assertEquals(signer.verify(withChain, signer.sign(withChain)), {
      ok: true,
    });
  });

  await t.step("refuses a missing signature", () => {
    assertEquals(signer.verify(input, null), { ok: false, reason: "missing" });
    assertEquals(signer.verify(input, ""), { ok: false, reason: "missing" });
  });

  await t.step("refuses props it did not sign", () => {
    const sig = signer.sign(input);
    const edited = {
      ...input,
      props: JSON.stringify({
        component: "/components/Other.tsx",
        __resolveType: "site/sections/Widget.tsx",
      }),
    };
    assertEquals(signer.verify(edited, sig), {
      ok: false,
      reason: "invalid",
    });
  });

  await t.step("binds resolveChain and pathTemplate", () => {
    const sig = signer.sign(input);
    assertEquals(
      signer.verify({ ...input, resolveChain: "[]" }, sig).ok,
      false,
    );
    assertEquals(
      signer.verify({ ...input, pathTemplate: "/x" }, sig).ok,
      false,
    );
  });

  await t.step("fields cannot shift into each other", () => {
    const a = { props: "a|b", pathTemplate: "c" };
    const b = { props: "b", pathTemplate: "c|a" };
    assertNotEquals(signer.sign(a), signer.sign(b));
  });

  await t.step("another key's signature does not verify", () => {
    const other = createRenderSigner({ secret: "other" });
    assertEquals(signer.verify(input, other.sign(input)).ok, false);
  });
});

Deno.test("render signature mode", () => {
  assertEquals(createRenderSigner({ secret: "k" }).mode, "enforce");
  assert(createRenderSigner({ secret: "k" }).stableKey);
  // A per-process key breaks across pods, so it only reports by default.
  assertEquals(createRenderSigner().mode, "report");
  assert(!createRenderSigner().stableKey);
  assertEquals(
    createRenderSigner({ secret: "k", mode: "report" }).mode,
    "report",
  );
  assertEquals(createRenderSigner({ secret: "k", mode: "off" }).mode, "off");
  assertEquals(createRenderSigner({ mode: "enforce" }).mode, "enforce");
  assertEquals(
    createRenderSigner({ secret: "k", mode: "bogus" }).mode,
    "enforce",
  );
});
