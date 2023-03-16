import { Head } from "$fresh/runtime.ts";
import { inspectVSCode } from "../deps.ts";
import type { Flags, Page, Site } from "$live/types.ts";

declare global {
  interface Window {
    inspectVSCode: inspectVSCode.DomInspector;
    LIVE: {
      page: Page;
      site: Site;
      flags: Flags;
    };
  }
}

interface Props {
  site: Site;
  page?: Page;
  flags?: Flags;
}

type LiveEvent = {
  type: "scrollToComponent";
  args: { id: string };
} | {
  type: "DOMInspector";
  args: "activate" | "deactivate";
};

// TODO: Move inspect-vscode code to here so we don't need to do this stringification
const domInspectorModule = `
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
${inspectVSCode.DomInspector.toString()}
`;

const main = () => {
  // deno-lint-ignore no-explicit-any
  const isLiveEvent = (data: any): data is LiveEvent =>
    ["scrollToComponent", "DOMInspector"].includes(data?.type);

  const onKeydown = (event: KeyboardEvent) => {
    // in case loaded in iframe, avoid redirecting to editor while in editor
    if (window !== window.parent) {
      return;
    }

    // why?
    if (event.defaultPrevented) {
      return;
    }

    if (
      (event.ctrlKey && event.shiftKey && event.key === "E") ||
      event.key === "Escape"
    ) {
      event.preventDefault();
      event.stopPropagation();

      window.location.href =
        `https://deco.cx/admin/${window.LIVE.site.id}/pages/${window.LIVE.page.id}`;
    }
  };

  const onMessage = (event: MessageEvent<LiveEvent>) => {
    const { data } = event;

    if (!isLiveEvent(data)) {
      return;
    }

    switch (data.type) {
      case "scrollToComponent": {
        document
          .getElementById(data.args.id)
          ?.scrollIntoView({ behavior: "smooth" });

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
    }
  };

  const inspector = new DomInspector(document.body);

  /** Setup global variables */
  window.LIVE = JSON.parse(document.getElementById("__DECO_STATE")!.innerText);

  /** Setup listeners */

  // navigate to admin when user clicks ctrl+shift+e
  document.body.addEventListener("keydown", onKeydown);

  // focus element when inside admin
  addEventListener("message", onMessage);
};

function LiveControls({ site, page, flags = {} }: Props) {
  const partialPage = page && {
    id: page.id,
    path: page.path,
    state: page.state,
  };

  return (
    <Head>
      <script
        type="application/json"
        id="__DECO_STATE"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ page: partialPage, site, flags }),
        }}
      />
      <script
        type="module"
        dangerouslySetInnerHTML={{
          __html:
            `${domInspectorModule}\nrequestIdleCallback(${main.toString()})`,
        }}
      />
    </Head>
  );
}

export default LiveControls;
