import type { PageComponentData, Schemas } from "../types.ts";
import EditorProvider from "./EditorProvider.tsx";
import EditorSidebar from "./EditorSidebar.tsx";

export interface Props {
  components: PageComponentData[];
  template: string;
  componentSchemas: Schemas;
}

export default function Editor(
  { components, template, componentSchemas }: Props,
) {
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
