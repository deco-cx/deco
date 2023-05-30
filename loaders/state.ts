import { Resolvable } from "../engine/core/resolver.ts";
import { MiddlewareConfig } from "../routes/_middleware.ts";

export interface StateProp {
  key: string;
  value: Resolvable;
}
export interface Props {
  state: StateProp[];
}

/**
 * @title Shared application State Loader.
 * @description Set the application state using resolvables.
 */
export default function StateLoader(
  { state }: Props,
): MiddlewareConfig {
  return {
    state: state.reduce((acc, st) => {
      acc[st.key] = st.value;
      return acc;
    }, {} as Record<string, Resolvable>),
  };
}
