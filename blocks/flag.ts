import { Matcher } from "$live/blocks/matcher.ts";
import { applyConfig } from "$live/blocks/utils.ts";
import JsonViewer from "$live/blocks/utils.tsx";
import { Block, InstanceOf } from "$live/engine/block.ts";

export type Flag = InstanceOf<typeof flagBlock, "#/root/flags">;

// TODO Inheritance flag is not working Author Marcos V. Candeia
interface FlagObj<T = unknown> {
  matcher: Matcher;
  name: string;
  true: T;
  false: T;
  // date && percentage
}

// deno-lint-ignore no-explicit-any
export type FlagFunc<TConfig = any> = (c: TConfig) => FlagObj;

const flagBlock: Block<FlagFunc> = {
  type: "flags",
  introspect: {
    default: 0,
  },
  adapt: applyConfig,
  defaultPreview: async (flag, { request }) => {
    const matchCtx = await request.json();
    const resp = flag.matcher(matchCtx) ? flag.true : flag.false;
    return { Component: JsonViewer, props: { body: JSON.stringify(resp) } };
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
