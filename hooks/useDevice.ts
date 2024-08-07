import { useContext } from "preact/hooks";
import { SectionContext } from "../components/section.tsx";

export const useDevice = () => {
  const ctx = useContext(SectionContext);

  if (typeof document !== "undefined") {
    throw new Error("Cannot use useDevice on the browser");
  }

  if (!ctx) {
    console.warn("Missing context in rendering tree")
  }

  return ctx?.device || "desktop";
};
