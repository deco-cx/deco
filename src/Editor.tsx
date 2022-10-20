import type { PageComponentData, Schemas } from "../types.ts";
import EditorProvider from "./EditorProvider.tsx";
import EditorSidebar from "./EditorSidebar.tsx";

export interface EditorProps {
  components: PageComponentData[];
  template: string;
  componentSchemas: Schemas;
  siteId: number;
}

export default function Editor(
  { components, template, componentSchemas, siteId }: EditorProps,
) {
  return (
    <EditorProvider
      components={components}
      template={template}
      componentSchemas={componentSchemas}
      siteId={siteId}
    >
      <EditorSidebar />
    </EditorProvider>
  );
}
