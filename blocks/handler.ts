// deno-lint-ignore-file no-explicit-any
import { InstanceOf } from "$live/blocks/types.ts";
import { FreshHandler } from "$live/engine/adapters/fresh/manifest.ts";
import { Block } from "$live/engine/block.ts";
import { applyConfig, configOnly } from "./utils.ts";

type HandlerFunc<TConfig = any> = (config: TConfig) => FreshHandler;

const handlerBlock: Block<HandlerFunc> = {
  type: "handlers",
  introspect: configOnly("./handlers"),
  adapt: applyConfig,
};

export type Handler = InstanceOf<typeof handlerBlock, "#/root/handlers">;

export default handlerBlock;
