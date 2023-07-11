import { Head } from "$fresh/runtime.ts";
import { context } from "$live/live.ts";
import type { Flag, Site } from "$live/types.ts";
import { DomInspectorActivators, inspectVSCode } from "../deps.ts";

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
  const styleSheet = `
  html {
    height: 100%;
  }
  
  body {
    height: 100%;
  }
  
  .live-controls-loading {
    z-index: 999999;
    pointer-events: none;
    display: inline-block;
    aspect-ratio: 1/1;
    width: 2.5rem;
    color: #2fd180;
    background-color: currentColor;
    -webkit-mask-size: 100%;
    mask-size: 100%;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-image: url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nNDQnIGhlaWdodD0nNDQnIHZpZXdCb3g9JzAgMCA0NCA0NCcgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJyBzdHJva2U9JyNmZmYnPjxnIGZpbGw9J25vbmUnIGZpbGwtcnVsZT0nZXZlbm9kZCcgc3Ryb2tlLXdpZHRoPScyJz48Y2lyY2xlIGN4PScyMicgY3k9JzIyJyByPScxJz48YW5pbWF0ZSBhdHRyaWJ1dGVOYW1lPSdyJyBiZWdpbj0nMHMnIGR1cj0nMS44cycgdmFsdWVzPScxOyAyMCcgY2FsY01vZGU9J3NwbGluZScga2V5VGltZXM9JzA7IDEnIGtleVNwbGluZXM9JzAuMTY1LCAwLjg0LCAwLjQ0LCAxJyByZXBlYXRDb3VudD0naW5kZWZpbml0ZScgLz48YW5pbWF0ZSBhdHRyaWJ1dGVOYW1lPSdzdHJva2Utb3BhY2l0eScgYmVnaW49JzBzJyBkdXI9JzEuOHMnIHZhbHVlcz0nMTsgMCcgY2FsY01vZGU9J3NwbGluZScga2V5VGltZXM9JzA7IDEnIGtleVNwbGluZXM9JzAuMywgMC42MSwgMC4zNTUsIDEnIHJlcGVhdENvdW50PSdpbmRlZmluaXRlJyAvPjwvY2lyY2xlPjxjaXJjbGUgY3g9JzIyJyBjeT0nMjInIHI9JzEnPjxhbmltYXRlIGF0dHJpYnV0ZU5hbWU9J3InIGJlZ2luPSctMC45cycgZHVyPScxLjhzJyB2YWx1ZXM9JzE7IDIwJyBjYWxjTW9kZT0nc3BsaW5lJyBrZXlUaW1lcz0nMDsgMScga2V5U3BsaW5lcz0nMC4xNjUsIDAuODQsIDAuNDQsIDEnIHJlcGVhdENvdW50PSdpbmRlZmluaXRlJyAvPjxhbmltYXRlIGF0dHJpYnV0ZU5hbWU9J3N0cm9rZS1vcGFjaXR5JyBiZWdpbj0nLTAuOXMnIGR1cj0nMS44cycgdmFsdWVzPScxOyAwJyBjYWxjTW9kZT0nc3BsaW5lJyBrZXlUaW1lcz0nMDsgMScga2V5U3BsaW5lcz0nMC4zLCAwLjYxLCAwLjM1NSwgMScgcmVwZWF0Q291bnQ9J2luZGVmaW5pdGUnIC8+PC9jaXJjbGU+PC9nPjwvc3ZnPg==);
    mask-image: url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nNDQnIGhlaWdodD0nNDQnIHZpZXdCb3g9JzAgMCA0NCA0NCcgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJyBzdHJva2U9JyNmZmYnPjxnIGZpbGw9J25vbmUnIGZpbGwtcnVsZT0nZXZlbm9kZCcgc3Ryb2tlLXdpZHRoPScyJz48Y2lyY2xlIGN4PScyMicgY3k9JzIyJyByPScxJz48YW5pbWF0ZSBhdHRyaWJ1dGVOYW1lPSdyJyBiZWdpbj0nMHMnIGR1cj0nMS44cycgdmFsdWVzPScxOyAyMCcgY2FsY01vZGU9J3NwbGluZScga2V5VGltZXM9JzA7IDEnIGtleVNwbGluZXM9JzAuMTY1LCAwLjg0LCAwLjQ0LCAxJyByZXBlYXRDb3VudD0naW5kZWZpbml0ZScgLz48YW5pbWF0ZSBhdHRyaWJ1dGVOYW1lPSdzdHJva2Utb3BhY2l0eScgYmVnaW49JzBzJyBkdXI9JzEuOHMnIHZhbHVlcz0nMTsgMCcgY2FsY01vZGU9J3NwbGluZScga2V5VGltZXM9JzA7IDEnIGtleVNwbGluZXM9JzAuMywgMC42MSwgMC4zNTUsIDEnIHJlcGVhdENvdW50PSdpbmRlZmluaXRlJyAvPjwvY2lyY2xlPjxjaXJjbGUgY3g9JzIyJyBjeT0nMjInIHI9JzEnPjxhbmltYXRlIGF0dHJpYnV0ZU5hbWU9J3InIGJlZ2luPSctMC45cycgZHVyPScxLjhzJyB2YWx1ZXM9JzE7IDIwJyBjYWxjTW9kZT0nc3BsaW5lJyBrZXlUaW1lcz0nMDsgMScga2V5U3BsaW5lcz0nMC4xNjUsIDAuODQsIDAuNDQsIDEnIHJlcGVhdENvdW50PSdpbmRlZmluaXRlJyAvPjxhbmltYXRlIGF0dHJpYnV0ZU5hbWU9J3N0cm9rZS1vcGFjaXR5JyBiZWdpbj0nLTAuOXMnIGR1cj0nMS44cycgdmFsdWVzPScxOyAwJyBjYWxjTW9kZT0nc3BsaW5lJyBrZXlUaW1lcz0nMDsgMScga2V5U3BsaW5lcz0nMC4zLCAwLjYxLCAwLjM1NSwgMScgcmVwZWF0Q291bnQ9J2luZGVmaW5pdGUnIC8+PC9jaXJjbGU+PC9nPjwvc3ZnPg==)
  }
  
  .live-controls-loading-uptop {
    position: fixed;
    top: 0;
    left: 0;
  }
  
  .live-controls-loading-center {
    position: fixed;
    top: 50%;
    left: 50%;
  }
  `;

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

      const pathname =
        `/admin/sites/${window.LIVE.site.name}/blocks/${window.LIVE.page.id}`;

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

  let focusElementIndex = 0;

  /** Focuses last changed section */
  const focusLastUsedSection = () =>
    document.querySelectorAll("body>section").item(focusElementIndex)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });

  const queue = {
    promise: Promise.resolve(),
    size: 0,
    abort: () => {},
  };

  const enqueue = (url: string, props: string) => {
    queue.abort();

    const controller = new AbortController();
    queue.size++;

    queue.promise = queue.promise.then(async () => {
      try {
        const style = document.createElement("style");
        style.innerHTML = styleSheet;
        document.body.appendChild(style);
        const div = document.createElement("div");
        div.classList.add("live-controls-loading");
        div.classList.add("live-controls-loading-uptop");
        document.body.appendChild(div);

        const signal = controller.signal;
        const html = await fetch(url, {
          method: "POST",
          body: props,
          signal,
        }).then((res) => res.text());

        signal.throwIfAborted();

        document.documentElement.innerHTML = html;

        // Source: https://stackoverflow.com/questions/2592092/executing-script-elements-inserted-with-innerhtml
        document.querySelectorAll("script").forEach((oldScriptEl) => {
          const newScriptEl = document.createElement("script");

          Array.from(oldScriptEl.attributes).forEach((attr) => {
            newScriptEl.setAttribute(attr.name, attr.value);
          });

          const scriptText = document.createTextNode(oldScriptEl.innerHTML);
          newScriptEl.appendChild(scriptText);

          oldScriptEl.parentNode?.replaceChild(newScriptEl, oldScriptEl);
        });

        // auto focus the last used section
        focusLastUsedSection();
      } catch (error) {
        if (error === "Newer changes detected") {
          return;
        }

        console.error(error);
      } finally {
        queue.size--;
      }
    });

    queue.abort = () => controller.abort("Newer changes detected");
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
      case "editor::rerender": {
        const { url, props } = data.args;

        if (url && props) enqueue(url, props);

        return;
      }
      case "editor::focus": {
        focusElementIndex = data.args.index;

        // We are not fetching a new page. Focus the section.
        // Otherwise, just wait for the autofocus to work
        if (queue.size === 0) {
          focusLastUsedSection();
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
            __html: JSON.stringify({ page, site, flags }),
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
