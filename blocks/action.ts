// deno-lint-ignore-file no-explicit-any
import { FnProps, applyProps } from "$live/blocks/utils.ts";
import JsonViewer from "$live/components/JsonViewer.tsx";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { ActionContext, LiveConfig } from "$live/types.ts";

export type Action = InstanceOf<typeof actionBlock, "#/root/actions">;

export type ActionModule<
  TConfig = any,
  Ctx extends ActionContext<LiveConfig<any, TConfig>> = ActionContext<
    LiveConfig<any, TConfig>
  >,
> = BlockModule<FnProps<any, any, Ctx>>;

const actionBlock: Block<ActionModule> = {
  type: "actions",
  introspect: {
    "default": ["1", "state.$live"],
  },
  adapt: <
    TCtx extends ActionContext<any> = ActionContext<any>,
    TConfig = any,
  >(
    mod: ActionModule<TConfig, TCtx>,
  ) => [
   applyProps(mod),
  ],
  defaultPreview: (result) => {
    return {
      Component: JsonViewer,
      props: { body: JSON.stringify(result, null, 2) },
    };
  },
};

/**
 * Actions are arbitrary functions that always run in a request context, it execute mutations.
 */
export default actionBlock;
