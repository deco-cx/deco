import { useRef, useState } from "preact/hooks";
import PlusIcon from "./icons/PlusIcon.tsx";
import Button from "./ui/Button.tsx";
import Modal from "./ui/Modal.tsx";
import ComponentPreviewList from "./ComponentPreviewList.tsx";
import type { ComponentPreview } from "../editor.tsx";

function ToCItem({ component, componentLabel }: ComponentPreview) {
  return (
    <li key={component}>
      <a
        class="font-medium  text-gray-500 hover:text-black"
        href={`#${component}`}
      >
        {componentLabel}
      </a>
    </li>
  );
}

interface Props {
  onAddComponent: (componentName: string) => void;
}

export default function AddNewComponent({ onAddComponent }: Props) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [openModal, setOpenModal] = useState<boolean>(false);
  const [tocComponents, setToCComponents] = useState<
    ComponentPreview[]
  >([]);

  return (
    <>
      <Button
        class="py-2 w-full flex justify-center"
        onClick={() => setOpenModal(true)}
      >
        <PlusIcon fill="#ffffff" />
      </Button>

      <Modal
        open={openModal}
        onDismiss={() => setOpenModal(false)}
        class="rounded bg-white p-5 w-2/3"
      >
        <div class="w-full container flex justify-between mb-4">
          <span class="text-xl font-bold">Componentes</span>
          <Button onClick={() => setOpenModal(false)}>
            <PlusIcon fill="#ffffff" class="rotate-45" />
          </Button>
        </div>

        <div class="flex">
          <div
            class="overflow-y-auto max-h-[80vh] h-[80vh] w-full"
            ref={targetRef}
          >
            <ComponentPreviewList
              registerToC={setToCComponents}
              onClickComponent={(componentName) => {
                onAddComponent(componentName);
                setOpenModal(false);
              }}
            />
          </div>
          <nav
            class="ml-4 px-4 border-l w-1/6"
            aria-label="Table of components"
          >
            <ul>
              {tocComponents.map((
                props,
              ) => <ToCItem key={props.component} {...props} />)}
            </ul>
          </nav>
        </div>
      </Modal>
    </>
  );
}
