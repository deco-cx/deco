import { useRef, useState } from "preact/hooks";
import PlusIcon from "./icons/PlusIcon.tsx";
import Button from "./ui/Button.tsx";
import Modal from "./ui/Modal.tsx";
import AudienceIcon from "./ui/AudienceIcon.tsx";
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

const DraftAudience = () => {
  return (
    <div class="flex-row items-center gap-1">
      <p class="text-sm font-medium">
        Essa página só pode ser acessada pelo link:
      </p>
      <div class="flex w-full items-center gap-1">
        <p>{window.location.href}</p>
      </div>
      <div class="mt-4">
        <Button>Copiar link</Button>
      </div>
    </div>
  );
};

const PublicAudience = () => {
  return (
    <div class="flex-row items-center gap-1">
      <p class="text-sm font-medium">Público</p>
      <div class="mt-4">
        <Button>Publicar</Button>
      </div>
    </div>
  );
};

export default function Audience({ onAddComponent }: Props) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [openModal, setOpenModal] = useState<boolean>(false);
  const [audience, setAudience] = useState<string>("draft");
  const [tocComponents, setToCComponents] = useState<
    ComponentPreview[]
  >([]);

  return (
    <>
      <Button
        onClick={() => setOpenModal(true)}
      >
        <span class="px-1">
          <AudienceIcon />
        </span>
      </Button>

      <Modal
        open={openModal}
        onDismiss={() => setOpenModal(false)}
        class="container rounded bg-white p-5 w-1/3"
      >
        <div class="w-full flex justify-between mb-4">
          <span class="text-xl font-bold">Audiência</span>
          <Button onClick={() => setOpenModal(false)}>
            <PlusIcon class="rotate-45" />
          </Button>
        </div>

        <div class="flex">
          <div
            class="overflow-y-auto w-full"
            ref={targetRef}
          >
            <select
              class="p-2 my-2 shadow-md"
              onInput={(e: any) => setAudience(e.target.value)}
            >
              <option value="draft">Rascunho (apenas com o link)</option>
              <option value="public">Público</option>
              <option value="new" disabled>Nova audiência...</option>
            </select>

            {audience == "draft" && <DraftAudience />}
            {audience == "public" && <PublicAudience />}
          </div>
        </div>
      </Modal>
    </>
  );
}
