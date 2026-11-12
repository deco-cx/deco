import { assertEquals } from "@std/assert";
import { main } from "./LiveControls.tsx";

Deno.test("editor::inject runs scripts only from trusted origins", () => {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  const realAddEventListener = g.addEventListener;
  let onMessage = (_event: unknown) => {};
  g.window = { location: { origin: "https://shop.com" } };
  g.document = {
    getElementById: () => ({ textContent: "{}" }),
    body: { addEventListener() {} },
  };
  g.addEventListener = (_type: string, fn: typeof onMessage) => {
    onMessage = fn;
  };
  const inject = (origin: string) => {
    g.ran = false;
    onMessage({
      origin,
      data: {
        type: "editor::inject",
        args: { script: "globalThis.ran = true" },
      },
    });
    return g.ran;
  };

  try {
    main(["https://admin.deco.cx"]);
    assertEquals(inject("https://attacker--site.deco.host"), false);
    assertEquals(inject("null"), false);
    assertEquals(inject("https://admin.deco.cx"), true);
    assertEquals(inject("https://shop.com"), true); // the page itself
  } finally {
    g.addEventListener = realAddEventListener;
    delete g.window;
    delete g.document;
    delete g.ran;
  }
});
