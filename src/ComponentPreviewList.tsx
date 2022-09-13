import { tw } from "twind";
import { useEffect, useState } from "preact/hooks";
import { IS_BROWSER } from "$fresh/runtime.ts";
import PlusIcon from "./icons/PlusIcon.tsx";
import type { ComponentPreview } from "../editor.tsx";

let components: ComponentPreview[] | undefined = undefined;
let islands: ComponentPreview[] | undefined = undefined;

interface ComponentPreviewProps extends ComponentPreview {
  onClick: () => void;
}

function ComponentPreview(
  { componentLabel, link, onClick }: ComponentPreviewProps,
) {
  return (
    <div class={tw`mb-3 last-child:mb-0`}>
      <label class={tw`font-bold`}>{componentLabel}</label>
      <div
        class={tw`relative border rounded min-h-[50px] max-h-[250px]`}
      >
        {link
          ? (
            <iframe
              src={link}
              class={tw`max-h-[250px] w-full`}
            />
          )
          : null}
        <div
          class={tw`group flex items-center justify-center absolute inset-0 cursor-pointer hover:bg-gray-200 hover:bg-opacity-50 transition-colors ease-in`}
          onClick={onClick}
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
}

export default function ComponentPreviewList({ onClickComponent }: Props) {
  const [_, update] = useState<boolean>(false);

  // Fetch components once
  useEffect(function fetchComponentAndIslands() {
    let cancel = false;
    if (IS_BROWSER && !components) {
      // TODO: change this to GET
      fetch("/live/api/components").then((res) => res.json())
        .then(({ components: apiComponents }) => {
          if (cancel) {
            return;
          }

          components = apiComponents;
          update((oldValue) => !oldValue);
        });
    }

    if (IS_BROWSER && !islands) {
      fetch("/live/api/components").then((res) => res.json())
        .then(({ islands: apiIslands }) => {
          if (cancel) {
            return;
          }

          islands = apiIslands;
          update((oldValue) => !oldValue);
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
              onClick={() => {
                onClickComponent(componentPreview.component);
              }}
            />
          );
        },
      )}
      {islands?.map(
        (componentPreview) => {
          return (
            <ComponentPreview
              {...componentPreview}
              onClick={() => {
                onClickComponent(componentPreview.component);
              }}
            />
          );
        },
      )}
    </>
  );
}
