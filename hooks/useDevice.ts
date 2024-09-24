import { useContext } from "preact/hooks";

import { SectionContext } from "../components/section.ts";
import type { Device } from "../utils/userAgent.ts";

/**
 * Hook to access the device information.
 *
 * @throws {Error}  - Throws an error if used on the browser or when context is missing.
 * @returns {Device} The device information.
 */
export const useDevice = (): Device => {
  const ctx = useContext(SectionContext);

  if (typeof document !== "undefined") {
    throw new Error("Cannot use useDevice on the browser");
  }

  if (!ctx) {
    throw new Error("Missing context in rendering tree");
  }

  return ctx.device;
};
