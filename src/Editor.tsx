/** @jsx h */
/** @jsxFrag Fragment */
import { Fragment, h } from "preact";
import EditorProvider from "./EditorProvider.tsx";
import EditorSidebar from "./EditorSidebar.tsx";

export default function Editor({ components, template, projectComponents }) {
  return (
    <EditorProvider
      components={components}
      template={template}
      projectComponents={projectComponents}
    >
      <EditorSidebar />
    </EditorProvider>
  );
}
