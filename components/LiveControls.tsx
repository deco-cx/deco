import { useEffect, useState } from "preact/hooks";
import { Page, Site } from "$live/types.ts";
import { DomInspector } from "https://deno.land/x/inspect_vscode@0.2.0/mod.ts";
import { ViewfinderCircleIcon } from "https://esm.sh/@heroicons/react@2.0.12/24/outline?alias=react:preact/compat&external=preact/compat";

declare global {
  interface Window {
    inspectVSCode: DomInspector;
    LIVE: {
      page: Page;
      site: Site;
    };
  }
}

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
    const isLoadedInIframe = window !== window.parent;
    if (
      !isLoadedInIframe && // Avoid redirect to editor while in editor
      event.ctrlKey && event.shiftKey && event.key === "E" &&
      !event.defaultPrevented
    ) {
      event.stopPropagation();
      window.location =
        `https://deco.cx/live/${window.LIVE.site.id}/pages/${window.LIVE.page.id}` as any;
    }
  };

  useEffect(() => {
    window["LIVE"] = {
      site,
      page,
    };

    window.inspectVSCode = new DomInspector(document.body);

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
    <div class="fixed left-3 bottom-3 flex flex-row justify-center pt-4">
      {!isProduction &&
        (
          <span class="relative z-0 inline-flex shadow-sm ">
            <button
              type="button"
              onClick={handleInspectClick}
              class={`${
                inspectActive ? "bg-gray-300" : "bg-white hover:bg-gray-50 "
              } relative inline-flex rounded-md items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 focus:z-10 focus:outline-none focus:ring-1 focus:ring-primary-green-dark focus:border-primary-green-dark`}
            >
              <ViewfinderCircleIcon className="w-6 h-6" />
            </button>
          </span>
        )}
    </div>
  );
}
