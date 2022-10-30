import { useEffect } from "preact/hooks";
import { Page } from "$live/types.ts";
import InspectVSCode from "inspect_vscode/island.tsx";

interface Props {
  page: Page;
}

type IframeCommand = {
  type: "scrollTo";
  args: ScrollToOptions;
};

export const sendCommandToIframe = (
  iframe: HTMLIFrameElement,
  command: IframeCommand
) => {
  iframe.contentWindow?.postMessage(command);
};

export default function InjectLiveScripts({ page }: Props) {
  useEffect(() => {
    console.log("Running");
    // @ts-expect-error: Create global types for this later
    window["LIVE"] = {
      page,
    };

    addEventListener("message", (event) => {
      const data = event.data as IframeCommand;

      switch (data.type) {
        case "scrollTo": {
          window.scrollTo(data.args);
        }
      }
    });
  }, []);

  return <InspectVSCode />;
}
