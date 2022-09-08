import { tabbable } from "tabbable";
import { useEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";

// Type from tabbable
// https://github.com/focus-trap/tabbable/blob/a09ba0be3d680e54aef5e32449b8fb033780780b/index.d.ts#L1
type FocusableElement = HTMLElement | SVGElement;

interface TrapFocusParams {
  beforeElementRef: RefObject<HTMLElement>;
  trapFocusRef: RefObject<HTMLElement>;
  afterElementRef: RefObject<HTMLElement>;
}

/*
 * Element that will maintain the focus inside trapFocusRef, focus the first element,
 * and focus back on the element that was in focus when useTrapFocus was triggered.
 *
 * Inspired by Reakit useTrapFocus https://github.com/reakit/reakit/blob/a211d94da9f3b683182568a56479b91afb1b85ae/packages/reakit/src/Dialog/__utils/useFocusTrap.ts
 */
const useTrapFocus = ({
  trapFocusRef,
  beforeElementRef,
  afterElementRef,
}: TrapFocusParams) => {
  const tabbableNodesRef = useRef<FocusableElement[]>();
  const nodeToRestoreRef = useRef<HTMLElement | null>(
    window.document?.hasFocus()
      ? (document.activeElement as HTMLElement)
      : null,
  );

  // Focus back on the element that was focused when useTrapFocus is triggered.
  useEffect(() => {
    const nodeToRestore = nodeToRestoreRef.current;

    return () => {
      nodeToRestore?.focus();
    };
  }, [nodeToRestoreRef]);

  // Set focus on first tabbable element
  useEffect(() => {
    if (!trapFocusRef.current) {
      return;
    }

    if (!tabbableNodesRef.current) {
      tabbableNodesRef.current = tabbable(trapFocusRef.current);
    }

    const [firstTabbable] = tabbableNodesRef.current;

    if (!firstTabbable) {
      trapFocusRef.current.focus();

      return;
    }

    firstTabbable.focus();
  }, [trapFocusRef]);

  // Handle loop focus. Set keydown and focusin event listeners
  useEffect(() => {
    if (
      !trapFocusRef.current ||
      !beforeElementRef.current ||
      !afterElementRef.current
    ) {
      return;
    }

    const beforeElement = beforeElementRef.current;
    const afterElement = afterElementRef.current;
    const trapFocus = trapFocusRef.current;

    const handleLoopFocus = (nativeEvent: FocusEvent) => {
      if (!document.hasFocus()) {
        return;
      }

      tabbableNodesRef.current = tabbable(trapFocusRef.current!);

      if (!tabbableNodesRef.current.length) {
        trapFocus.focus();
      }

      /*
       * Handle loop focus from beforeElementRef. This node can only be focused if the user press shift tab.
       * It will focus the last element of the trapFocusRef.
       */
      if (nativeEvent.target === beforeElement) {
        tabbableNodesRef.current[tabbableNodesRef.current.length - 1]?.focus();
      }

      /*
       * Handle loop focus from afterElementRef. This node can only be focused if the user press tab.
       * It will focus the first element of the trapFocusRef.
       */
      if (nativeEvent.target === afterElement) {
        tabbableNodesRef.current[0]?.focus();
      }
    };

    beforeElement?.addEventListener("focusin", handleLoopFocus);
    afterElement?.addEventListener("focusin", handleLoopFocus);

    return () => {
      beforeElement?.removeEventListener("focusin", handleLoopFocus);
      afterElement?.removeEventListener("focusin", handleLoopFocus);
    };
  }, [tabbableNodesRef, afterElementRef, beforeElementRef, trapFocusRef]);
};

export default useTrapFocus;
