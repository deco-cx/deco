import { tw } from "twind";
import { useEffect, useState } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
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
    if (IS_BROWSER) {
      const effect = async () => {
        const { components: apiComponents, islands } = await fetch(
          "/live/api/components",
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
    }

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
              class={tw`mb-3 last-child:mb-0`}
            >
              <label class={tw`font-medium`}>{componentLabel}</label>
              <div
                class={tw`relative border rounded min-h-[50px] max-h-[250px]`}
              >
                <iframe
                  data-src={link}
                  class={tw`max-h-[250px] w-full`}
                />
                <div
                  class={tw`group flex items-center justify-center absolute inset-0 cursor-pointer hover:bg-gray-200 hover:bg-opacity-50 transition-colors ease-in`}
                  onClick={() => onClickComponent(component)}
                >
                  <PlusIcon
                    width={32}
                    height={32}
                    class={tw`hidden group-hover:block text-gray-400`}
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
