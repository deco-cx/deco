/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import EditorProvider from "./EditorProvider.tsx";
import EditorSidebar from "./EditorSidebar.tsx";

export default function Editor({ components, template, componentSchemas }) {
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
