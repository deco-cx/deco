// deno-lint-ignore-file no-explicit-any
import JsonViewer from "../components/JsonViewer.ts";
import type { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import { applyProps, type FnProps } from "./utils.ts";

export type Action = InstanceOf<typeof actionBlock, "#/root/actions">;

export type ActionModule<
  TProps = any,
  TResp = any,
> = BlockModule<FnProps<TProps, TResp>>;

const actionBlock: Block<ActionModule> = {
  type: "actions",
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
