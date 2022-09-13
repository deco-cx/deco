import { tw } from "twind";
import { useEffect, useState } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
import PlusIcon from "./icons/PlusIcon.tsx";
import type { ComponentPreview } from "../editor.tsx";

let components: ComponentPreview[] | undefined = undefined;
let islands: ComponentPreview[] | undefined = undefined;

interface ComponentPreviewProps extends ComponentPreview {
  onClickComponent: (componentName: string) => void;
}

function ComponentPreview(
  { componentLabel, link, onClickComponent, component }: ComponentPreviewProps,
) {
  return (
    <div class={tw`mb-3 last-child:mb-0`} id={component}>
      <label class={tw`font-medium`}>{componentLabel}</label>
      <div
        class={tw`relative border rounded min-h-[50px] max-h-[250px]`}
      >
        <iframe
          src={link}
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
}

interface Props {
  onClickComponent: (componentName: string) => void;
  registerToC: (
    tocList: { islands?: ComponentPreview[]; components?: ComponentPreview[] },
  ) => void;
}

export default function ComponentPreviewList(
  { onClickComponent, registerToC }: Props,
) {
  const [_, update] = useState<boolean>(false);

  // Fetch components once
  useEffect(function fetchComponentAndIslands() {
    let cancel = false;
    if (IS_BROWSER && !components) {
      fetch("/live/api/components").then((res) => res.json())
        .then(({ components: apiComponents }) => {
          if (cancel) {
            return;
          }

          components = apiComponents;
          update((oldValue) => !oldValue);
          registerToC({ components: apiComponents });
        });
    }

    if (IS_BROWSER && !islands) {
      fetch("/live/api/islands").then((res) => res.json())
        .then(({ islands: apiIslands }) => {
          if (cancel) {
            return;
          }

          islands = apiIslands;
          update((oldValue) => !oldValue);
          registerToC({ islands: apiIslands });
        });
    }

    return () => {
      cancel = true;
    };
  }, []);

  return (
    <>
      {components?.map(
        (componentPreview) => {
          return (
            <ComponentPreview
              {...componentPreview}
              onClickComponent={onClickComponent}
            />
          );
        },
      )}
      {islands?.map(
        (componentPreview) => {
          return (
            <ComponentPreview
              {...componentPreview}
              onClickComponent={onClickComponent}
            />
          );
        },
      )}
    </>
  );
}
