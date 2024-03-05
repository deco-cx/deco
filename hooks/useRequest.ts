import { useContext } from "preact/hooks";
import { SectionContext } from "deco/components/section.tsx";

export const useRequest = () => {
    const ctx = useContext(SectionContext);
    console.log(ctx?.request)

    return ctx?.request;
}