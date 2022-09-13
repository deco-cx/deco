import { tw } from "twind";
import { useState } from "preact/hooks";
import PlusIcon from "./icons/PlusIcon.tsx";
import Button from "./ui/Button.tsx";
import Modal from "./ui/Modal.tsx";
import ComponentPreviewList from "./ComponentPreviewList.tsx";
import type { ComponentPreview } from "../editor.tsx";

type ToCState = { islands: ComponentPreview[]; components: ComponentPreview[] };

function ToCItem({ component, componentLabel }: ComponentPreview) {
  return (
    <li key={component}>
      <a
        class={tw`font-medium  text-gray-500 hover:text-black`}
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
  const [openModal, setOpenModal] = useState<boolean>(false);
  const [tocComponents, setToCComponents] = useState<
    ToCState
  >({ islands: [], components: [] });
  const registerToC = (newToC: Partial<ToCState>) => {
    console.log("New ToC", newToC);
    setToCComponents((oldToCComponents) => ({
      ...oldToCComponents,
      ...newToC,
    }));
  };

  return (
    <>
      <Button
        class="w-full flex justify-center"
        onClick={() => setOpenModal(true)}
      >
        <PlusIcon />
      </Button>

      <Modal
        open={openModal}
        onDismiss={() => setOpenModal(false)}
        class={tw`container rounded bg-white p-5`}
      >
        <div class="w-full flex justify-between mb-4">
          <span class={tw`text-xl font-bold`}>Componentes</span>
          <Button onClick={() => setOpenModal(false)}>
            <PlusIcon class={tw`rotate-45`} />
          </Button>
        </div>

        <div class={tw`flex`}>
          <div class={tw`overflow-y-auto max-h-[80vh] h-[80vh] w-full`}>
            <ComponentPreviewList
              registerToC={registerToC}
              onClickComponent={(componentName) => {
                onAddComponent(componentName);
                setOpenModal(false);
              }}
            />
          </div>
          <nav
            class={tw`ml-4 px-4 border-l w-1/6`}
            aria-label="Table of components"
          >
            <ul>
              {tocComponents.components.map((
                props,
              ) => <ToCItem key={props.component} {...props} />)}
              {tocComponents.islands.map((
                props,
              ) => <ToCItem key={props.component} {...props} />)}
            </ul>
          </nav>
        </div>
      </Modal>
    </>
  );
}
