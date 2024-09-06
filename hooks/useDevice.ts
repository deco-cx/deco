import { useContext } from "preact/hooks";

import { SectionContext } from "../components/section.tsx";
import { Device } from "../utils/userAgent.ts";

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
