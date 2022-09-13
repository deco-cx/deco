import { tw } from "twind";
import { useEffect, useRef, useState } from "preact/hooks";
import PlusIcon from "./icons/PlusIcon.tsx";
import Button from "./ui/Button.tsx";
import Modal from "./ui/Modal.tsx";
import ComponentPreviewList from "./ComponentPreviewList.tsx";
import type { ComponentPreview } from "../editor.tsx";

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
  const targetRef = useRef<HTMLDivElement>(null);
  const [openModal, setOpenModal] = useState<boolean>(false);
  const [tocComponents, setToCComponents] = useState<
    ComponentPreview[]
  >([]);

  useEffect(function initObserverIframes() {
    if (!targetRef.current || !(openModal && tocComponents.length > 0)) {
      return;
    }

    const target = targetRef.current;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.intersectionRatio > 0) {
          const iframe = (entry.target as HTMLIFrameElement);

          // Prevent set the src and make the browser fetch the page multiple times
          if (!iframe.src) {
            iframe.src = iframe.dataset.src ?? "";
          }
        }
      });
    }, {
      root: target,
    });

    const iframes = target.getElementsByTagName("iframe");
    for (const iframe of iframes) {
      observer.observe(iframe);
    }

    return () => {
      observer.disconnect();
    };
    // tocComponents are the components fetched by the ComponentsPreviewList and they doesn't exist when openModal = true at the first time
  }, [openModal, tocComponents]);

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
          <div
            class={tw`overflow-y-auto max-h-[80vh] h-[80vh] w-full`}
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
            class={tw`ml-4 px-4 border-l w-1/6`}
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
