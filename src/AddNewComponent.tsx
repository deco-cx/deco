import { tw } from "twind";
import { useState } from "preact/hooks";
import PlusIcon from "./icons/PlusIcon.tsx";
import Button from "./ui/Button.tsx";
import Modal from "./ui/Modal.tsx";
import { useEditor } from "./EditorProvider.tsx";

interface Props {
  onAddComponent: (componentName: string) => void;
}

export default function AddNewComponent({ onAddComponent }: Props) {
  const [openModal, setOpenModal] = useState<boolean>(false);
  const { componentSchemas } = useEditor();

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
          class={tw`container rounded bg-white p-5 h-5/6`}
        >
          {JSON.stringify(componentSchemas)}
        </Modal>
      )}
    </>
  );
}
