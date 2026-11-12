import { assertEquals } from "@std/assert";
import { main } from "./LiveControls.tsx";

type Listener = (event: unknown) => void;

const setup = ({ framed }: { framed: boolean }) => {
  const listeners: Listener[] = [];
  const scrolled: string[] = [];
  const parent = {};
  const win: Record<string, unknown> = {
    location: { origin: "https://site.example", pathname: "/", search: "" },
  };
  win.parent = framed ? parent : win;

  const g = globalThis as unknown as Record<string, unknown>;
  const previous = {
    window: g.window,
    document: g.document,
    addEventListener: g.addEventListener,
  };
  g.window = win;
  g.document = {
    body: { addEventListener: () => {} },
    getElementById: (id: string) =>
      id === "__DECO_STATE"
        ? {
          textContent: JSON.stringify({
            site: { id: 1, name: "site" },
            trustedOrigins: ["https://admin.deco.cx"],
          }),
        }
        : { scrollIntoView: () => scrolled.push(id) },
  };
  g.addEventListener = (type: string, fn: Listener) => {
    if (type === "message") listeners.push(fn);
  };

  main();

  const restore = () => Object.assign(g, previous);
  const dispatch = (event: unknown) => listeners.forEach((fn) => fn(event));
  return { parent, win, scrolled, dispatch, restore };
};

const inject = {
  type: "editor::inject",
  args: { script: "globalThis.__liveControlsPwned = true" },
};

Deno.test("LiveControls postMessage handling", async (t) => {
  const g = globalThis as unknown as Record<string, unknown>;

  await t.step("ignores editor::inject from untrusted origins", () => {
    const { parent, dispatch, restore } = setup({ framed: true });
    try {
      dispatch({
        source: parent,
        origin: "https://evil.example",
        data: inject,
      });
      dispatch({ source: parent, origin: "null", data: inject });
      assertEquals(g.__liveControlsPwned, undefined);
    } finally {
      restore();
    }
  });

  await t.step(
    "ignores editor::inject from windows other than the parent",
    () => {
      const { dispatch, restore } = setup({ framed: true });
      try {
        dispatch({ source: {}, origin: "https://admin.deco.cx", data: inject });
        assertEquals(g.__liveControlsPwned, undefined);
      } finally {
        restore();
      }
    },
  );

  await t.step("ignores every message when not framed (window.open)", () => {
    const { win, scrolled, dispatch, restore } = setup({ framed: false });
    try {
      dispatch({ source: win, origin: "https://admin.deco.cx", data: inject });
      dispatch({
        source: win,
        origin: "https://admin.deco.cx",
        data: { type: "scrollToComponent", args: { id: "section" } },
      });
      assertEquals(g.__liveControlsPwned, undefined);
      assertEquals(scrolled, []);
    } finally {
      restore();
    }
  });

  await t.step("handles messages from a trusted parent editor", () => {
    const { parent, scrolled, dispatch, restore } = setup({ framed: true });
    try {
      dispatch({
        source: parent,
        origin: "https://admin.deco.cx",
        data: { type: "scrollToComponent", args: { id: "section" } },
      });
      dispatch({
        source: parent,
        origin: "https://admin.deco.cx",
        data: inject,
      });
      assertEquals(scrolled, ["section"]);
      assertEquals(g.__liveControlsPwned, true);
    } finally {
      delete g.__liveControlsPwned;
      restore();
    }
  });

  await t.step("allows localhost editors on any port", () => {
    const { parent, scrolled, dispatch, restore } = setup({ framed: true });
    try {
      dispatch({
        source: parent,
        origin: "http://localhost:4200",
        data: { type: "scrollToComponent", args: { id: "local" } },
      });
      assertEquals(scrolled, ["local"]);
    } finally {
      restore();
    }
  });
});
