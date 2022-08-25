/** @jsx h */
import { h } from "preact";
import { useEditor } from "./EditorProvider.tsx";

export default function EditorPageWrapper({ manifest }) {
  const { components } = useEditor();

  const getComponentModule = (component: string) => {
    return manifest.islands?.[`./islands/${component}.tsx`] ??
      manifest.components?.[`./components/${component}.tsx`];
  };

  return (
    <div class="relative w-full">
      {components.map(
        ({ component, props }) => {
          const Comp = getComponentModule(component)?.default;

          return <Comp {...props} />;
        },
      )}
    </div>
  );
}
