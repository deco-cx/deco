import { FlagObj } from "$live/blocks/flag.ts";
export { onBeforeResolveProps } from "./everyone.ts";

export type Props<T> = FlagObj<T>;

/**
 * @title Flag
 */
export default function Flag<T>({
  matcher,
  name,
  true: T,
  false: F,
}: Props<T>): FlagObj<T> {
  return {
    matcher,
    true: T,
    false: F,
    name,
  };
}
