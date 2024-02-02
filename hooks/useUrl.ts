import { usePageContext } from "deco/runtime/fresh/routes/entrypoint.tsx";
import { IS_BROWSER } from "$fresh/runtime.ts";

const useUrl = () => {
    if(IS_BROWSER){
        return new URL(globalThis.window.location.href)
    }
    const pageContext = usePageContext()
    return pageContext?.url
}

export default useUrl;