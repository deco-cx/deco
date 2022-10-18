import type { h } from "preact";
import { useRef } from "preact/hooks";
import { createPortal } from "preact/compat";
import useTrapFocus from "./hooks/useTrapFocus.tsx";

interface ModalContentProps extends h.JSX.HTMLAttributes<HTMLDivElement> {}

export function ModalContent({ children, ...props }: ModalContentProps) {
  const trapFocusRef = useRef<HTMLDivElement>(null);
  const beforeElementRef = useRef<HTMLDivElement>(null);
  const afterElementRef = useRef<HTMLDivElement>(null);

  useTrapFocus({
    trapFocusRef,
    beforeElementRef,
    afterElementRef,
  });

  return (
    <>
      <div
        ref={beforeElementRef}
        tabIndex={0}
        aria-hidden="true"
      />
      <div
        ref={trapFocusRef}
        aria-modal="true"
        role="dialog"
        tabIndex={-1}
        {...props}
      >
        {children}
      </div>
      <div
        ref={afterElementRef}
        tabIndex={0}
        aria-hidden="true"
      />
    </>
  );
}

interface Props extends ModalContentProps {
  open: boolean;
  onDismiss?: (event: MouseEvent | KeyboardEvent) => void;
  modalProps?: Omit<
    h.JSX.HTMLAttributes<HTMLDivElement>,
    "onClick" | "onKeyDown"
  >;
}

export default function Modal(
  { children, open, modalProps = {}, onDismiss, ...props }: Props,
) {
  const handleBackdropClick = (event: MouseEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    event.stopPropagation();
    onDismiss?.(event);
  };

  const handleBackdropKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) {
      return;
    }

    event.stopPropagation();
    onDismiss?.(event);
  };

  return open
    ? createPortal(
      <div
        {...modalProps}
        class={modalProps.class ??
          `bg-gray-500 bg-opacity-50 fixed inset-0 z-50 flex justify-center items-center`}
        onKeyDown={handleBackdropKeyDown}
        onClick={handleBackdropClick}
      >
        <ModalContent {...props} onClick={(e) => e.stopPropagation()}>
          {children}
        </ModalContent>
      </div>,
      document.body,
    )
    : null;
}
