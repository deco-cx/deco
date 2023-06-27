import { MultivariateFlag } from "$live/blocks/flag.ts";
export { onBeforeResolveProps } from "./everyone.ts";

/**
 * @title Multivariate
 */
export type MultivariateProps<T> = MultivariateFlag<T>;

/**
 * @title Multivariate Option
 */
export default function MultivariateFlag<T>(
  props: MultivariateProps<T>,
): MultivariateFlag<T> {
  return props;
}
