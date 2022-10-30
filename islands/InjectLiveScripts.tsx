import { useEffect } from "preact/hooks";
import { Page } from "$live/types.ts";
import InspectVSCode from "inspect_vscode/island.tsx";

interface Props {
  page: Page;
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

const EDITOR_ORIGINS = ["http://localhost:4200", "https://deco.cx"];

export default function InjectLiveScripts({ page }: Props) {
  useEffect(() => {
    console.log("Running");
    // @ts-expect-error: Create global types for this later
    window["LIVE"] = {
      page,
    };

    addEventListener("message", (event) => {
      if (!EDITOR_ORIGINS.includes(event.origin)) {
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

  return <InspectVSCode />;
}
