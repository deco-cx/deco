/** @jsx h */
import { h } from "preact";

export default function EditorPageWrapper({ manifest, components }) {
  const getComponentModule = (component: string) => {
    return manifest.islands?.[`./islands/${component}.tsx`] ??
      manifest.components?.[`./components/${component}.tsx`];
  };

  return (
    <div class="relative w-full">
      {components?.map(
        ({ component, props }) => {
          const Comp = getComponentModule(component)?.default;

          return <Comp {...props} />;
        },
      )}
    </div>
  );
}
