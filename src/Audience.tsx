import { useRef } from "preact/hooks";
import PlusIcon from "./icons/PlusIcon.tsx";
import Button from "./ui/Button.tsx";
import Modal from "./ui/Modal.tsx";
import { UseFormReturn, useWatch } from "react-hook-form";
import LinkButton from "./ui/LinkButton.tsx";
import { signal } from "@preact/signals";

const openModal = signal(false);
const handleOpenModal = () => {
  openModal.value = true;
};
const handleCloseModal = () => {
  openModal.value = false;
};

interface Props {
  methods: UseFormReturn<any>;
  onSubmit: () => void;
  flag: any;
}

export default function Audience(
  { methods, onSubmit, flag }: Props,
) {
  const targetRef = useRef<HTMLDivElement>(null);
  const traffic = flag?.traffic;
  const audience = useWatch({ name: "audience", control: methods.control });

  return (
    <>
      <LinkButton
        onClick={handleOpenModal}
        disabled={!flag}
        class="bg-[#23AB6E] hover:bg-[#1B8756] text-white text-xs font-semibold"
      >
        Test & Publish
      </LinkButton>

      <Modal
        open={openModal.value}
        onDismiss={handleCloseModal}
        class="rounded bg-white p-5 w-1/3"
      >
        <div class="w-full flex justify-between mb-4">
          <span class="text-xl font-bold">Audiência</span>
          <Button onClick={handleCloseModal}>
            <PlusIcon fill="#ffffff" class="rotate-45" />
          </Button>
        </div>

        <div class="flex">
          <div
            class="overflow-y-auto w-full"
            ref={targetRef}
          >
            <select
              class="p-2 my-2 shadow-md"
              value={audience}
              {...methods.register("audience")}
            >
              <option value="draft">
                Rascunho (apenas com o link)
              </option>
              <option value="public">
                Público
              </option>
              <option value="new" disabled>Nova audiência...</option>
            </select>

            {audience === "draft" && (
              <div class="flex-row items-center gap-1">
                <p class="text-sm font-medium">
                  Essa página só pode ser acessada pelo link:
                </p>
                <div class="flex w-full items-center gap-1">
                  <p>{globalThis.window?.location?.href}</p>
                </div>
                <div class="mt-4">
                  {traffic > 0
                    ? <Button>Salvar como rascunho</Button>
                    : <Button>Copiar link</Button>}
                </div>
              </div>
            )}
            {audience === "public" && (
              <div class="flex-row items-center gap-1">
                <div>
                  <div class="flex items-center mb-4">
                    <input
                      id="experiment"
                      type="checkbox"
                      checked={traffic > 0}
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
                  <Button onClick={onSubmit}>Publicar</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
