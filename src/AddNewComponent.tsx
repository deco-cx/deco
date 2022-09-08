import { tw } from "twind";
import { useState } from "preact/hooks";
import PlusIcon from "./icons/PlusIcon.tsx";
import Button from "./ui/Button.tsx";
import Modal from "./ui/Modal.tsx";
import { useEditor } from "./EditorProvider.tsx";
import { IS_BROWSER } from "https://deno.land/x/fresh@1.1.0/src/runtime/utils.ts";

interface Props {
  onAddComponent: (componentName: string) => void;
}

export default function AddNewComponent({ onAddComponent }: Props) {
  const [openModal, setOpenModal] = useState<boolean>(false);
  const [components, setComponents] = useState<
    { html: string; componentLabel: string; component: string }[] | undefined
  >(undefined);

  if (IS_BROWSER && !components) {
    fetch("/live/api/components", { method: "POST" }).then((res) => res.json())
      .then(({ components: apiComponents }) => setComponents(apiComponents));
  }

  return (
    <>
      <Button
        class="w-full flex justify-center"
        onClick={() => setOpenModal(true)}
      >
        <PlusIcon />
      </Button>

      {openModal && (
        <Modal
          open={openModal}
          onDismiss={() => setOpenModal(false)}
          class={tw`container rounded bg-white p-5 h-5/6 overflow-y-auto`}
        >
          <div>
            {components?.map(({ html, component, componentLabel }, index) => {
              return (
                <>
                  <label>{componentLabel}</label>
                  <div class="relative border rounded">
                    <iframe
                      srcDoc={`<!DOCTYPE html>${html}`}
                      key={index}
                      class={tw`h-[200px] max-h-[250px] w-full`}
                    />
                    <div
                      class={tw`group flex items-center justify-center absolute inset-0 z-50 cursor-pointer hover:bg-gray-200 hover:bg-opacity-50 transition-colors easy-in`}
                      onClick={() => {
                        onAddComponent(component);
                        setOpenModal(false);
                      }}
                    >
                      <PlusIcon
                        width={32}
                        height={32}
                        class={tw`hidden group-hover:block text-gray-400`}
                      />
                    </div>
                  </div>
                </>
              );
            })}
          </div>
        </Modal>
      )}
    </>
  );
}
