import { Head } from "$fresh/runtime.ts";
import { inspectVSCode } from "../deps.ts";
import type { Site } from "$live/types.ts";

interface Page {
  id: string | number;
}

declare global {
  interface Window {
    inspectVSCode: inspectVSCode.DomInspector;
    LIVE: {
      page: Page;
      site: Site;
    };
  }
}

interface Props {
  site: Site;
  page?: Page;
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

  //@ts-ignore: "DomInspector not available"
  const inspector = new DomInspector(document.body);

  /** Setup global variables */
  window.LIVE = JSON.parse(document.getElementById("__DECO_STATE")!.innerText);

  /** Setup listeners */

  // navigate to admin when user clicks ctrl+shift+e
  document.body.addEventListener("keydown", onKeydown);

  // focus element when inside admin
  addEventListener("message", onMessage);
};

function LiveControls({ site, page }: Props) {
  const partialPage = page && {
    id: page.id,
  };

  return (
    <Head>
      <script
        type="application/json"
        id="__DECO_STATE"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ page: partialPage, site }),
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
