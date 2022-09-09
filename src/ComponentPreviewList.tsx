import { tw } from "twind";
import { useState } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
import PlusIcon from "./icons/PlusIcon.tsx";
import type { ComponentPreview } from "../editor.tsx";

let _components: ComponentPreview[] | undefined = undefined;

interface Props {
  onClickComponent: (componentName: string) => void;
}

export default function ComponentPreviewList({ onClickComponent }: Props) {
  const [components, setComponents] = useState<
    ComponentPreview[] | undefined
  >(_components);

  // Fetch components once
  if (IS_BROWSER && !_components) {
    // TODO: change this to GET
    fetch("/live/api/components", { method: "POST" }).then((res) => res.json())
      .then(({ components: apiComponents }) => {
        _components = apiComponents;
        setComponents(apiComponents);
      });
  }

  return (
    <>
      {components?.map(
        ({ html, component, componentLabel }, index) => {
          return (
            <div class={tw`mb-3 last-child:mb-0`}>
              <label class={tw`font-bold`}>{componentLabel}</label>
              <div
                class={tw`relative border rounded min-h-[50px] max-h-[250px]`}
              >
                {html
                  ? (
                    <iframe
                      srcDoc={`<!DOCTYPE html>${html}`}
                      key={index}
                      class={tw`max-h-[250px] w-full`}
                    />
                  )
                  : null}
                <div
                  class={tw`group flex items-center justify-center absolute inset-0 cursor-pointer hover:bg-gray-200 hover:bg-opacity-50 transition-colors ease-in`}
                  onClick={() => {
                    onClickComponent(component);
                  }}
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
