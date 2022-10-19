import type { Flag, PageComponentData, Schemas } from "../types.ts";
import EditorProvider from "./EditorProvider.tsx";
import EditorSidebar from "./EditorSidebar.tsx";

export interface Props {
  components: PageComponentData[];
  template: string;
  componentSchemas: Schemas;
  siteId: number;
  flag: Flag | null;
  name: string;
}

export default function Editor(
  { components, template, componentSchemas, siteId, flag, name }: Props,
) {
  return (
    <EditorProvider
      components={components}
      template={template}
      componentSchemas={componentSchemas}
      siteId={siteId}
      flag={flag}
      name={name}
    >
      <EditorSidebar />
    </EditorProvider>
  );
}
