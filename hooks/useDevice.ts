import { useContext } from "preact/hooks";
import { SectionContext } from "../components/section.tsx";
import { IS_BROWSER } from "deco/deps.ts";

export const useDevice = () => {
  const ctx = useContext(SectionContext);

  if (IS_BROWSER) {
    throw new Error("Cannot use useDevice on the browser");
  }

  if (!ctx) {
    console.warn("Missing context in rendering tree")
  }

  return ctx?.device || "desktop";
};
