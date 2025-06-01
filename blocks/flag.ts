import type { TsType, TsTypeReference } from "@deco/deno-ast-wasm/types";
import type { HttpContext } from "../blocks/handler.ts";
import type { Matcher } from "../blocks/matcher.ts";
import JsonViewer from "../components/JsonViewer.tsx";
import type { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import { isDeferred } from "../engine/core/resolver.ts";
import { type Device, deviceOf } from "../utils/userAgent.ts";

export type Flag = InstanceOf<typeof flagBlock, "#/root/flags">;

export interface FlagObj<TVariant = unknown> {
  matcher: Matcher;
  name: string;
  true: TVariant;
  false: TVariant;
}

/**
 * @title {{#beautifySchemaTitle}}{{{rule.__resolveType}}}{{/beautifySchemaTitle}} Variant
 * @label hidden
 * @icon flag
 */
export interface Variant<T> {
  /**
   * @title Condition
   */
  rule: Matcher;
  /**
   * @title Content
   */
  value: T;
}

/**
 * @title Multivariate Flag
 */
export interface MultivariateFlag<T = unknown> {
  /**
   * @minItems 1
   * @addBehavior 1
   */
  variants: Variant<T>[];
}

const isMultivariate = (
  f: FlagObj | MultivariateFlag,
): f is MultivariateFlag => {
  return (f as MultivariateFlag).variants !== undefined;
};

// deno-lint-ignore no-explicit-any
export type FlagFunc<TConfig = any> = (
  c: TConfig,
) => FlagObj | MultivariateFlag;

const flagBlock: Block<BlockModule<FlagFunc>> = {
  type: "flags",
  introspect: {
    includeReturn: (tsType: TsType) => {
      return (tsType as TsTypeReference)?.typeParams?.params?.[0];
    },
  },
  adapt: <
    TConfig = unknown,
  >(func: {
    default: FlagFunc<TConfig>;
  }) =>
  async ($live: TConfig, { request }: HttpContext) => {
    const flag = func.default($live);
    let device: Device | null = null;
    const ctx = {
      request,
      siteId: 0,
      get device() {
        return device ??= deviceOf(ctx.request);
      },
    };
    if (isMultivariate(flag)) {
      const variants = flag.variants || [];

      const results = await Promise.all(
        variants.map((variant) =>
          typeof variant?.rule === "function" ? variant.rule(ctx) : false
        ),
      );
      const match = variants.find((_, index) => results[index]) || variants[0];

      return isDeferred(match?.value) ? match?.value() : match?.value;
    }
    const matchValue = typeof flag?.matcher === "function"
      ? flag.matcher(ctx)
      : false;
    return matchValue ? flag?.true : flag?.false;
  },
  defaultPreview: (resp) => {
    return {
      Component: JsonViewer,
      props: { body: JSON.stringify(resp) },
    };
  },
};

/**
 * <T>(config:TConfig) => Flag<T>
 * The flag block has the signature as
 * The flag object is formed by a `matcher` which is a function that receives a context and returns a boolean (meaning that that context "matches")
 * an arbitrary name (string)
 * and the respective `true` and `false` values.
 * Flags are widely used across the code but its meaning is tied to the developer lifecycle. Developer decides to have a feature flag somewhere and define its type
 * the block is responsible for generating the right schema for such flag.
 */
export default flagBlock;
