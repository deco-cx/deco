/** @jsxRuntime automatic */
/** @jsxImportSource preact */
import { assertEquals, assertNotEquals } from "@std/assert";
import { renderToString } from "preact-render-to-string";
import { SectionContext } from "../components/section.tsx";
import { DRAFT_PREVIEW_KEY } from "../runtime/draftBadge.ts";
import { useSection } from "./useSection.ts";

const POINTER =
  "studio.decocms.com/api/fila/decofile/vm-1/main?token=tok.abc@v1";

// Minimal SectionContext double — only the fields `useSection` reads.
const makeCtx = (
  // deno-lint-ignore no-explicit-any
  bag: WeakMap<any, any>,
  overrides: Partial<SectionContext> = {},
): SectionContext =>
  ({
    revision: "rev-1",
    renderSalt: "salt-1",
    deploymentId: "dep-1",
    resolveChain: [],
    ...overrides,
    request: new Request("https://shop.example.com/"),
    context: {
      state: {
        vary: { build: () => "" },
        pathTemplate: "/",
        bag,
      },
    },
  }) as unknown as SectionContext;

// Render a probe that captures the URL `useSection` builds under `ctx`.
const renderUrl = (
  // deno-lint-ignore no-explicit-any
  bag: WeakMap<any, any>,
  overrides: Partial<SectionContext> = {},
): string => {
  let url = "";
  const Probe = () => {
    url = useSection({ props: { __resolveType: "site/sections/X.tsx" } });
    return null;
  };
  renderToString(
    <SectionContext.Provider value={makeCtx(bag, overrides)}>
      <Probe />
    </SectionContext.Provider>,
  );
  return url;
};

Deno.test("useSection draft pointer propagation", async (t) => {
  await t.step(
    "carries the active pointer as a top-level ?__draft= when a draft is bound",
    () => {
      const bag = new WeakMap();
      bag.set(DRAFT_PREVIEW_KEY, POINTER);
      const url = renderUrl(bag);
      const params = new URL(url, "http://localhost").searchParams;
      // Read off the top-level param (what the server actually resolves from),
      // not nested inside `href` — that is the whole point of the fix.
      assertEquals(params.get("__draft"), POINTER);
    },
  );

  await t.step("omits __draft on ordinary (non-draft) traffic", () => {
    const url = renderUrl(new WeakMap());
    const params = new URL(url, "http://localhost").searchParams;
    assertEquals(params.get("__draft"), null);
  });
});

Deno.test("useSection __cb follows the content of the blocks on the chain", async (t) => {
  const cb = (overrides: Partial<SectionContext>) =>
    new URL(renderUrl(new WeakMap(), overrides), "http://localhost")
      .searchParams.get("__cb");
  const chain = [
    { type: "resolver", value: "website/handlers/fresh.ts" },
    { type: "prop", value: "page" },
    { type: "resolvable", value: "pages-home" },
    { type: "prop", value: "sections" },
    { type: "prop", value: 0 },
  ] as SectionContext["resolveChain"];
  const home = { sections: [{ __resolveType: "site/sections/X.tsx" }] };
  const other = { title: "a" };

  await t.step("unchanged when another block is published", () => {
    assertEquals(
      cb({
        revision: "rev-1",
        resolveChain: chain,
        resolvables: { "pages-home": home, other },
      }),
      cb({
        revision: "rev-2",
        resolveChain: chain,
        resolvables: { "pages-home": home, other: { title: "b" } },
      }),
    );
  });

  await t.step("changes when a block on the chain changes", () => {
    assertNotEquals(
      cb({ resolveChain: chain, resolvables: { "pages-home": home } }),
      cb({
        resolveChain: chain,
        resolvables: { "pages-home": { sections: [] } },
      }),
    );
  });

  await t.step("changes with the deployment", () => {
    const resolvables = { "pages-home": home };
    assertNotEquals(
      cb({ resolveChain: chain, resolvables, deploymentId: "dep-1" }),
      cb({ resolveChain: chain, resolvables, deploymentId: "dep-2" }),
    );
  });

  await t.step("falls back to the revision without named blocks", () => {
    assertNotEquals(cb({ revision: "rev-1" }), cb({ revision: "rev-2" }));
  });
});
