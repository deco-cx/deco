/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import { useEffect } from "preact/hooks";
import type { Mode, PageComponentData, Schemas } from "../types.ts";
import EditorProvider from "./EditorProvider.tsx";
import EditorSidebar from "./EditorSidebar.tsx";

function Noop() {
  return <span />;
}

function handleKeyDown(event: KeyboardEvent) {
  if (
    event.ctrlKey && event.shiftKey && event.key === "E"
  ) {
    const url = new URL(window.location);
    if (url.searchParams.has("editor")) {
      url.searchParams.delete("editor");
    } else {
      url.searchParams.append("editor", "");
    }

    window.location = url.toString();
  }
}

interface Props {
  components: PageComponentData[];
  template: string;
  componentSchemas: Schemas;
  mode: Mode;
}

export default function Editor(
  { components, template, componentSchemas, mode }: Props,
) {
  useEffect(() => {
    document.body.addEventListener("keydown", handleKeyDown);
    return () => {
      return document.body.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (mode !== "edit") {
    // Noop span to prevent preact error related to siblings
    return <Noop />;
  }

  return (
    <EditorProvider
      components={components}
      template={template}
      componentSchemas={componentSchemas}
    >
      <EditorSidebar />
    </EditorProvider>
  );
}
