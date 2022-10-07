import { useRef, useState } from "preact/hooks";
import PlusIcon from "./icons/PlusIcon.tsx";
import Button from "./ui/Button.tsx";
import Modal from "./ui/Modal.tsx";
import AudienceIcon from "./ui/AudienceIcon.tsx";
import ComponentPreviewList from "./ComponentPreviewList.tsx";
import type { ComponentPreview } from "../editor.tsx";
import { UseFormReturn } from "https://esm.sh/v94/react-hook-form@7.34.2/X-YS9yZWFjdDpwcmVhY3QvY29tcGF0CmQvcHJlYWN0QDEwLjEwLjY/dist/index.d.ts";

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
  methods: UseFormReturn<any>;
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
      <div>
        <div class="flex items-center mb-4">
          <input
            id="experiment"
            type="radio"
            value="experiment"
            name="mode"
            class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          <label
            for="experiment"
            class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
          >
            Experimento
          </label>
        </div>
        <div class="flex items-center">
          <input
            checked
            id="publish"
            type="radio"
            value="publish"
            name="mode"
            class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          <label
            for="publish"
            class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
          >
            Publicar
          </label>
        </div>
      </div>
      <div class="mt-4">
        <Button>Publicar</Button>
      </div>
    </div>
  );
};

export default function Audience({ onAddComponent, methods, onSubmit }: Props) {
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
            {audience == "public" && (
              <div class="flex-row items-center gap-1">
                <div>
                  <div class="flex items-center mb-4">
                    <input
                      id="experiment"
                      type="checkbox"
                      value="true"
                      {...methods.register("experiment")}
                      class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <label
                      for="experiment"
                      class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
                    >
                      Experimento
                    </label>
                  </div>
                </div>
                <div class="mt-4">
                  <Button onClick={(e) => onSubmit(e)}>Publicar</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
