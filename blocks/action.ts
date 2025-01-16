// deno-lint-ignore-file no-explicit-any
import {
  applyProps,
  type FnProps,
  type GateKeeperAccess,
} from "../blocks/utils.tsx";
import JsonViewer from "../components/JsonViewer.tsx";
import type { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import { gateKeeper } from "./utils.tsx";

export type Action = InstanceOf<typeof actionBlock, "#/root/actions">;

export interface ActionModule<
  TProps = any,
  TResp = any,
> extends BlockModule<FnProps<TProps, TResp>>, GateKeeperAccess {}

const actionBlock: Block<ActionModule> = {
  type: "actions",
  adapt: <
    TProps = any,
  >(
    mod: ActionModule<TProps>,
  ) => [
    applyProps(gateKeeper(mod)),
  ],
  defaultPreview: (result) => {
    return {
      Component: JsonViewer,
      props: { body: JSON.stringify(result, null, 2) },
    };
  },
};

/**
 * Actions are arbitrary functions that always run in a request context, it executes mutations.
 */
export default actionBlock;
