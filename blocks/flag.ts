import { Matcher } from "$live/blocks/matcher.ts";
import { InstanceOf } from "$live/blocks/types.ts";
import { applyConfig, configOnly } from "$live/blocks/utils.ts";
import JsonViewer from "$live/blocks/utils.tsx";
import { Block } from "$live/engine/block.ts";

export type Flag = InstanceOf<typeof flagBlock, "#/root/flags">;

// TODO Inheritance flag is not working Author Marcos V. Candeia
interface FlagObj<T = unknown> {
  matcher: Matcher;
  name: string;
  true?: T;
  false?: T;
}

export type FlagFunc<TConfig = unknown> = (c: TConfig) => FlagObj;

const flagBlock: Block<FlagFunc> = {
  type: "flags",
  defaultPreview: async (flag, { request }) => {
    const matchCtx = await request.json();
    const resp = flag.matcher(matchCtx) ? flag.true : flag.false;
    return { Component: JsonViewer, props: { body: JSON.stringify(resp) } };
  },
  introspect: configOnly("./flags"),
  adapt: applyConfig,
};

export default flagBlock;
