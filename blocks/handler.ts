// deno-lint-ignore-file no-explicit-any
import { InstanceOf } from "$live/blocks/types.ts";
import {
  FreshContext,
  FreshHandler,
} from "$live/engine/adapters/fresh/manifest.ts";
import { Block } from "$live/engine/block.ts";
import { tsTypeToSchemeable } from "$live/engine/schema/transform.ts";
import {
  findExport,
  nodeToFunctionDefinition,
} from "$live/engine/schema/utils.ts";

export type Handler<TConfig = any> = (
  config: TConfig,
  ctx: FreshContext,
) => FreshHandler;

const handlerBlock: Block<Handler> = {
  type: "handlers",
  adapt: (handler) => (config, ctx) => {
    return handler.default(config, ctx);
  },
  introspect: async (ctx, path, ast) => {
    if (!path.startsWith("./handlers")) {
      return undefined;
    }
    const func = findExport("default", ast);
    if (!func) {
      return undefined;
    }
    const fn = nodeToFunctionDefinition(func);
    if (!fn) {
      throw new Error(
        `Default export of ${path} needs to be a const variable or a function`,
      );
    }

    const blockModuleRef = {
      functionRef: path,
      inputSchema: fn.params.length > 0
        ? await tsTypeToSchemeable(ctx, fn.params[0], [path, ast])
        : undefined,
    };

    return blockModuleRef;
  },
};

export type HandlerInstance = InstanceOf<
  typeof handlerBlock,
  "#/root/handlers"
>;

export default handlerBlock;
