import { useEffect, useState } from "preact/hooks";
import { asset } from "$fresh/runtime.ts";
import PlusIcon from "./icons/PlusIcon.tsx";
import type { ComponentPreview } from "../editor.tsx";

interface Props {
  onClickComponent: (componentName: string) => void;
  registerToC: (
    components: ComponentPreview[],
  ) => void;
}

export default function ComponentPreviewList(
  { onClickComponent, registerToC }: Props,
) {
  const [components, setComponents] = useState<ComponentPreview[] | undefined>(
    undefined,
  );

  useEffect(function fetchComponentAndIslands() {
    let cancel = false;
    const effect = async () => {
      // Using asset to add the querystring __fresh_c=BUILD_ID
      const { components: apiComponents, islands } = await fetch(
        asset("/live/api/components"),
      ).then((res) => res.json());

      if (cancel) return;
      const newComponents = [
        ...apiComponents,
        ...islands,
      ];
      setComponents(newComponents);
      registerToC(newComponents);
    };

    effect();

    return () => {
      cancel = true;
    };
  }, []);

  return (
    <>
      {components?.map(
        ({ component, componentLabel, link }) => {
          return (
            <div
              id={component}
              class="mb-3 last-child:mb-0"
            >
              <label class="font-medium">{componentLabel}</label>
              <div class="relative border rounded min-h-[50px] max-h-[250px]">
                <iframe
                  src={asset(link)}
                  class="max-h-[250px] w-full"
                />
                <div
                  class="group flex items-center justify-center absolute inset-0 cursor-pointer hover:bg-gray-200 hover:bg-opacity-50 transition-colors ease-in"
                  onClick={() => onClickComponent(component)}
                >
                  <PlusIcon
                    width={32}
                    height={32}
                    class="hidden group-hover:block text-gray-400"
                  />
                </div>
              </div>
            </div>
          );
        },
      )}
    </>
  );
}
