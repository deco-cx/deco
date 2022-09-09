import { tw } from "twind";
import { useState } from "preact/hooks";
import PlusIcon from "./icons/PlusIcon.tsx";
import Button from "./ui/Button.tsx";
import Modal from "./ui/Modal.tsx";
import ComponentPreviewList from "./ComponentPreviewList.tsx";

interface Props {
  onAddComponent: (componentName: string) => void;
}

export default function AddNewComponent({ onAddComponent }: Props) {
  const [openModal, setOpenModal] = useState<boolean>(false);

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
          class={tw`container rounded bg-white p-5 max-h-[83.33%] overflow-y-auto`}
        >
          <div>
            <div class="w-full flex justify-between mb-4">
              <span class={tw`text-xl font-bold`}>Componentes</span>
              <Button onClick={() => setOpenModal(false)}>
                <PlusIcon class={tw`rotate-45`} />
              </Button>
            </div>
            <ComponentPreviewList
              onClickComponent={(componentName) => {
                onAddComponent(componentName);
                setOpenModal(false);
              }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
