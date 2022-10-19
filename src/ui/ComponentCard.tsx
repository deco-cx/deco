import { useSignal } from "@preact/signals";
import { useRef } from "preact/compat";
import IconButton from "./IconButton.tsx";
import DotsThreeIcon from "../icons/DotsThreeIcon.tsx";
import LinkButton from "./LinkButton.tsx";
import TrashIcon from "../icons/TrashIcon.tsx";
import { tw } from "twind";
import Modal from "./Modal.tsx";

interface Props {
  index: number;
  removeComponents: (removedComponents: number) => void;
  component: string;
  componentLabel: string;
}

export default function ComponentCard(
  { componentLabel, index, removeComponents, component }: Props,
) {
  const openOptions = useSignal(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleHover = () => {
    const componentId = `${component}-${index}`;
    const componentWrapper = document.getElementById(componentId);
    componentWrapper?.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  };

  const getOptionsStyle = () => {
    if (!buttonRef.current) return;

    const { right, top, height } = buttonRef
      .current.getBoundingClientRect();

    // 112 = 7rem = ModalContent width
    const style = { top: top + height + 5, left: right - 112 };

    return style;
  };

  return (
    <div class="bg-[#F8F8F8] hover:bg-[#F4F4F4] border border-[#F4F4F4] rounded transition-colors ease-in">
      <article
        class="cursor-pointer p-3 font-semibold text-xs leading-4 list-none flex justify-between items-center group h-10"
        onMouseEnter={handleHover}
      >
        <h3>
          {componentLabel}
        </h3>
        <IconButton
          ref={buttonRef}
          onClick={() => (openOptions.value = true)}
          class="hidden group-hover:flex"
        >
          <DotsThreeIcon />
        </IconButton>
      </article>

      <Modal
        open={openOptions.value}
        style={getOptionsStyle()}
        class="absolute z-10 bg-white rounded-lg p-2 border w-28"
        modalProps={{
          class:
            tw`bg-transparente fixed inset-0 z-50 flex justify-center items-center`,
        }}
        onDismiss={() => openOptions.value = false}
      >
        <menu class="list-none m-0 p-0">
          <LinkButton
            class="flex gap-2 text-xs w-full"
            onClick={() => {
              removeComponents(index);
              openOptions.value = false;
            }}
          >
            <TrashIcon fill="black" /> <span>Delete</span>
          </LinkButton>
        </menu>
      </Modal>
    </div>
  );
}
