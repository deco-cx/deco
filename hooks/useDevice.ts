import { useContext } from "preact/hooks";
import { SectionContext } from "deco/components/section.tsx";

export const useDevice = () => {
    const ctx = useContext(SectionContext);

    return ctx?.device;
}