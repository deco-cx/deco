import { useContext } from "preact/hooks";

import { SectionContext } from "../components/section.tsx";

/**
 * Hook to access set early hints information.
 *
 * @throws {Error}  - Throws an error if used on the browser or when context is missing.
 */
export const useSetEarlyHints = (): (hint: string) => void => {
  const ctx = useContext(SectionContext);
  return (hint: string) =>
    ctx?.context.state.response.headers.append("link", hint);
};
