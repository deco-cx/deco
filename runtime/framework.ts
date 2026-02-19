/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import { type Context, createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Framework } from "../components/section.tsx";

export const FrameworkContext: Context<Framework | undefined> = createContext<
  Framework | undefined
>(
  undefined,
);

/**
 * Hook to access the application framework from context.
 *
 * @throws {Error}  - Throws an error if framework is not set in context.
 * @returns {Framework} The application framework.
 */
export const useFramework = (): Framework => {
  return useContext(FrameworkContext)!;
};
