/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import { context } from "../deco.ts";
import { DomInspector, DomInspectorActivators } from "../deps.ts";
import type { Flag, Site } from "../types.ts";

const IS_LOCALHOST = context.deploymentId === undefined;

interface Page {
  id: string | number;
  pathTemplate?: string;
}

interface Props {
  site: Site;
  page?: Page;
  flags?: Flag[];
}

interface DecoWindow {
  LIVE: {
    page: Page;
    site: Site;
    flags?: Flag[];
    play?: boolean;
  };
}

type LiveEvent = {
  type: "scrollToComponent";
  args: { id: string; alternateId: string };
} | {
  type: "DOMInspector";
  args: "activate" | "deactivate";
} | {
  type: "editor::rerender";
  args: { url: string; props: string };
} | {
  type: "editor::focus";
  args: { index: number };
} | {
  type: "editor::inject";
  args: { script: string };
};

// TODO: Move inspect-vscode code to here so we don't need to do this stringification
// Only add dom inspector if running in localhost, i.e. deploymentId === undefined
const domInspectorModule = IS_LOCALHOST
  ? `
const DomInspectorActivators = {
  CmdE: {
    label: "Cmd+E or Ctrl+E",
    matchEvent: (event) =>
      (event.ctrlKey && event.key === "e") ||
      (event.metaKey && event.key === "e"),
  },
  Backquote: {
    label: "\` (backtick)",
    matchEvent: (event) => event.code === "Backquote",
  },
};
${DomInspector.toString()}`
  : "";

const main = () => {
  const WINDOW =
    (globalThis as unknown as { window: Window & DecoWindow }).window;
  const onKeydown = (event: KeyboardEvent) => {
    // in case loaded in iframe, avoid redirecting to editor while in editor
    if (WINDOW !== WINDOW.parent) {
      return;
    }

    // Disable going to admin while input it being typed
    if (event.target !== document.body) {
      return;
    }

    if (event.defaultPrevented) {
      return;
    }

    if (
      (event.ctrlKey && event.shiftKey && event.key === "E") ||
      event.key === "."
    ) {
      event.preventDefault();
      event.stopPropagation();

      const pathname =
        `/choose-editor?site=${WINDOW.LIVE.site.name}&domain=${WINDOW.location.origin}&pageId=${WINDOW.LIVE.page.id}`;

      const href = new URL(
        pathname,
        "https://deco.cx",
      );

      href.searchParams.set(
        "path",
        encodeURIComponent(
          `${WINDOW.location.pathname}${WINDOW.location.search}`,
        ),
      );
      href.searchParams.set(
        "pathTemplate",
        encodeURIComponent(WINDOW.LIVE.page.pathTemplate || "/*"),
      );
      WINDOW.location.href = `${href}`;
    }
  };

  const onMessage = (event: MessageEvent<LiveEvent>) => {
    const { data } = event;

    switch (data.type) {
      case "scrollToComponent": {
        const findById = document
          .getElementById(data.args.id);

        const findByAlternateId = data.args.alternateId
          ? document
            .getElementById(data.args.alternateId)
          : undefined;

        (findById ?? findByAlternateId)?.scrollIntoView({
          behavior: "smooth",
        });

        return;
      }
      case "DOMInspector": {
        const action = data.args;

        if (action === "activate" && !inspector?.isActive()) {
          inspector?.activate();
        } else if (action === "deactivate" && inspector?.isActive()) {
          inspector?.deactivate();
        }

        return;
      }
      case "editor::inject": {
        return eval(data.args.script);
      }
    }
  };

  //@ts-ignore: "DomInspector not available"
  const inspector = typeof DomInspector !== "undefined"
    //@ts-ignore: "DomInspector not available"
    ? new DomInspector(document.body, {
      outline: "1px dashed #2fd080",
      backgroundColor: "rgba(47, 208, 128, 0.33)",
      backgroundBlendMode: "multiply",
      activator: DomInspectorActivators.Backquote,
      path: "/live/inspect",
    })
    : undefined;

  /** Setup global variables */
  WINDOW.LIVE = {
    ...WINDOW.LIVE,
    ...JSON.parse(document.getElementById("__DECO_STATE")!.textContent || ""),
  };

  /** Setup listeners */

  // navigate to admin when user clicks ctrl+shift+e
  document.body.addEventListener("keydown", onKeydown);

  // focus element when inside admin
  addEventListener("message", onMessage);
};

function LiveControls({ site, page, flags }: Props) {
  return (
    <>
      <script
        type="application/json"
        id="__DECO_STATE"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ page, site, flags }),
        }}
      />
      <script
        type="module"
        dangerouslySetInnerHTML={{
          __html: `${domInspectorModule}\n(${main})()`,
        }}
      />
    </>
  );
}

export default LiveControls;
