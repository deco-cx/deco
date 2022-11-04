import { useEffect, useState } from "preact/hooks";
import { Page, Site } from "$live/types.ts";
import InspectVSCode from "inspect_vscode/island.tsx";

interface Props {
  site: Site;
  page: Page;
  isProduction: boolean;
}

type IframeCommand = {
  type: "scrollToComponent";
  args: { id: string };
};

export const sendCommandToIframe = ({
  iframe,
  command,
  targetOrigin,
}: {
  iframe: HTMLIFrameElement;
  command: IframeCommand;
  targetOrigin: string;
}) => {
  iframe.contentWindow?.postMessage(command, targetOrigin);
};

export default function LiveControls({ site, page, isProduction }: Props) {
  const [inspectActive, setInspectActive] = useState(false);
  const handleInspectClick = (event: MouseEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    event.stopPropagation();
    if (window.inspectVSCode) {
      if (window.inspectVSCode.isActive()) {
        window.inspectVSCode.deactivate();
        setInspectActive(false);
      } else {
        window.inspectVSCode.activate(() => setInspectActive(false));
        setInspectActive(true);
      }
    }
  };

  const handleKeyDownFunction = function handleKeyDown(event: any) {
    if (
      event.ctrlKey && event.shiftKey && event.key === "E" &&
      !event.defaultPrevented
    ) {
      event.stopPropagation();
      window.location =
        `https://deco.cx/live/${window.LIVE.site.id}/pages/${window.LIVE.page.id}`;
    }
  };

  useEffect(() => {
    // @ts-expect-error: Create global types for this later
    window["LIVE"] = {
      site,
      page,
    };

    document.body.addEventListener("keydown", handleKeyDownFunction);

    addEventListener("message", (event) => {
      const isLiveEvent = event?.data?.args;

      if (!isLiveEvent) {
        return;
      }

      const data = event.data as IframeCommand;

      switch (data.type) {
        case "scrollToComponent": {
          const element = document.getElementById(data.args.id);
          element?.scrollIntoView({
            behavior: "smooth",
          });
        }
      }
    });
  }, []);

  return (
    <div class="fixed left-3 bottom-3 rounded-xl bg-primary-dark text-primary-light px-3 py-1">
      {!isProduction &&
        (
          <button
            id="inspect-vscode-button"
            style={{ padding: "2px" }}
            onClick={handleInspectClick}
          >
            {inspectActive ? "Stop Inspect" : "Inspect"}
            <InspectVSCode />
          </button>
        )}
    </div>
  );
}
