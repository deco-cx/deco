import { HttpContext } from "$live/blocks/handler.ts";
import { Matcher } from "$live/blocks/matcher.ts";
import JsonViewer from "$live/components/JsonViewer.tsx";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { introspectWith } from "$live/engine/introspect.ts";
import { context } from "$live/live.ts";
import {
  TsTypeDef,
  TsTypeTypeRefDef,
} from "https://deno.land/x/deno_doc@0.58.0/lib/types.d.ts";
export type Flag = InstanceOf<typeof flagBlock, "#/root/flags">;

// TODO Inheritance flag is not working Author Marcos V. Candeia
export interface FlagObj<T = unknown> {
  matcher: Matcher;
  name: string;
  true: T;
  false: T;
  // date && percentage
}

// deno-lint-ignore no-explicit-any
export type FlagFunc<TConfig = any> = (c: TConfig) => FlagObj;

const flagBlock: Block<BlockModule<FlagFunc>> = {
  type: "flags",
  introspect: introspectWith<BlockModule<FlagFunc>>({
    "default": "0",
  }, (tsType: TsTypeDef) => {
    return (tsType as TsTypeTypeRefDef)?.typeRef?.typeParams?.[0];
  }),
  adapt: <
    TConfig = unknown,
  >(func: {
    default: FlagFunc<TConfig>;
  }) =>
  ($live: TConfig, { request }: HttpContext) => {
    const flag = func.default($live);
    const ctx = { request, siteId: context.siteId };
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
