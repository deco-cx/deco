// deno-lint-ignore-file no-explicit-any
import { applyProps, FnProps } from "$live/blocks/utils.ts";
import JsonViewer from "$live/components/JsonViewer.tsx";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";

export type Action = InstanceOf<typeof actionBlock, "#/root/actions">;

export type ActionModule<
  TProps = any,
> = BlockModule<FnProps<TProps>>;

const actionBlock: Block<ActionModule> = {
  type: "actions",
  introspect: {
    "default": "0",
  },
  adapt: <
    TProps = any,
  >(
    mod: ActionModule<TProps>,
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
