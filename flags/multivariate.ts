import { MultivariateFlag, Variant } from "$live/blocks/flag.ts";
import { Section } from "$live/blocks/section.ts";
import { asResolved } from "$live/engine/core/resolver.ts";

/**
 * @title Multivariate
 */
export type MultivariateProps<T = Section[]> = MultivariateFlag<T>;

/**
 * @title Variant
 */
export default function MultivariateFlag(
  props: MultivariateProps<Section[]>,
): MultivariateFlag<Section[]> {
  return props;
}

const isMultivariateProps = (
  props: unknown | MultivariateProps<unknown>,
): props is MultivariateProps<unknown> => {
  return (props as MultivariateProps<unknown>)?.variants !== undefined &&
    Array.isArray((props as MultivariateProps<unknown>)?.variants);
};

const isVariant = (
  variant: unknown | Variant<unknown>,
): variant is Variant<unknown> => {
  return (variant as Variant<unknown>).value !== undefined &&
    typeof variant === "object";
};

/**
 * This is used to avoid resolving flag values before matcher is actually evaluated
 */
export const onBeforeResolveProps = (props: unknown) => {
  if (isMultivariateProps(props)) {
    const newVariants = [];
    for (const variant of props.variants) {
      if (isVariant(variant)) {
        newVariants.push({
          ...variant,
          value: asResolved(variant.value, true),
        });
      } else {
        newVariants.push(variant);
      }
    }
    if (newVariants.length > 0) { // avoid shallow copy
      return {
        ...props,
        variants: newVariants,
      };
    }
    return props;
  }
  return props;
};
