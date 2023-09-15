import { DomInspectorActivators, Head, inspectVSCode } from "../deps.ts";
import { context } from "../live.ts";
import type { Flag, Site } from "../types.ts";

const IS_LOCALHOST = context.deploymentId === undefined;

interface Page {
  id: string | number;
  pathTemplate?: string;
}

declare global {
  interface Window {
    LIVE: {
      page: Page;
      site: Site;
      flags?: Flag[];
      play?: boolean;
    };
  }
}

interface Props {
  site: Site;
  page?: Page;
  flags?: Flag[];
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
${inspectVSCode.DomInspector.toString()}`
  : "";

const main = () => {
  const onKeydown = (event: KeyboardEvent) => {
    // in case loaded in iframe, avoid redirecting to editor while in editor
    if (window !== window.parent) {
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

      const pathname = window.LIVE.play
        ? `/play/blocks/${window.LIVE.page.id}?domain=${window.location.origin}`
        : `/admin/sites/${window.LIVE.site.name}/blocks/${window.LIVE.page.id}`;

      const href = new URL(
        pathname,
        "https://deco.cx",
      );

      href.searchParams.set(
        "path",
        encodeURIComponent(
          `${window.location.pathname}${window.location.search}`,
        ),
      );
      href.searchParams.set(
        "pathTemplate",
        encodeURIComponent(window.LIVE.page.pathTemplate ?? "/*"),
      );
      window.location.href = `${href}`;
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

        if (action === "activate" && !inspector.isActive()) {
          inspector.activate();
        } else if (action === "deactivate" && inspector.isActive()) {
          inspector.deactivate();
        }

        return;
      }
      case "editor::inject": {
        return eval(data.args.script);
      }
    }
  };

  //@ts-ignore: "DomInspector not available"
  const inspector = typeof DomInspector !== "undefined" &&
    //@ts-ignore: "DomInspector not available"
    new DomInspector(document.body, {
      outline: "1px dashed #2fd080",
      backgroundColor: "rgba(47, 208, 128, 0.33)",
      backgroundBlendMode: "multiply",
      activator: DomInspectorActivators.Backquote,
      path: "/live/inspect",
    });

  /** Setup global variables */
  window.LIVE = {
    ...window.LIVE,
    ...JSON.parse(document.getElementById("__DECO_STATE")!.innerText),
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
      <Head>
        <script
          type="application/json"
          id="__DECO_STATE"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({ page, site, flags, play: context.play }),
          }}
        />
        <script
          type="module"
          dangerouslySetInnerHTML={{
            __html: `${domInspectorModule}\n(${main})()`,
          }}
        />
      </Head>
    </>
  );
}

export default LiveControls;
