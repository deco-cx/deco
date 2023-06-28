import { MultivariateFlag } from "$live/blocks/flag.ts";
import { Section } from "$live/blocks/section.ts";
import { MultivariateProps } from "./multivariate.ts";
export { onBeforeResolveProps } from "./multivariate.ts";
/**
 * @title Page Variant
 */
export default function PageVariants(
  props: MultivariateProps<Section[]>,
): MultivariateFlag<Section[]> {
  return props;
}
