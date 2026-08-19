/** @jsxRuntime automatic */
/** @jsxImportSource preact */
import { assertEquals } from "@std/assert";
import { renderToString } from "preact-render-to-string";
import { SectionContext } from "../components/section.tsx";
import { DRAFT_PREVIEW_KEY } from "../runtime/draftBadge.ts";
import { useSection } from "./useSection.ts";

const POINTER =
  "studio.decocms.com/api/fila/decofile/vm-1/main?token=tok.abc@v1";

// Minimal SectionContext double — only the fields `useSection` reads.
// deno-lint-ignore no-explicit-any
const makeCtx = (bag: WeakMap<any, any>): SectionContext =>
  ({
    revision: "rev-1",
    renderSalt: "salt-1",
    deploymentId: "dep-1",
    resolveChain: [],
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
// deno-lint-ignore no-explicit-any
const renderUrl = (bag: WeakMap<any, any>): string => {
  let url = "";
  const Probe = () => {
    url = useSection({ props: { __resolveType: "site/sections/X.tsx" } });
    return null;
  };
  renderToString(
    <SectionContext.Provider value={makeCtx(bag)}>
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
