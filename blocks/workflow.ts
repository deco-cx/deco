// deno-lint-ignore-file no-explicit-any
import {
  Arg,
  LocalActivityCommand,
  Metadata,
  Workflow as DurableWorkflow,
  WorkflowContext as DurableWorkflowContext,
  WorkflowExecution,
} from "../deps.ts";
import { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import type { Manifest } from "../live.gen.ts";
import {
  AvailableActions,
  AvailableFunctions,
  AvailableLoaders,
  Invoke,
  InvokeResult,
  ManifestAction,
  ManifestFunction,
  ManifestLoader,
} from "../routes/live/invoke/index.ts";
import { AppManifest, LiveConfig, LiveState } from "../types.ts";
import { DotNestedKeys } from "../utils/object.ts";
import { HttpContext } from "./handler.ts";
import { FnContext, fnContextFromHttpContext } from "./utils.tsx";

export interface WorkflowMetadata extends Metadata {
  defaultInvokeHeaders?: Record<string, string>;
}
export class WorkflowContext<
  TManifest extends AppManifest = Manifest,
  TMetadata extends WorkflowMetadata = WorkflowMetadata,
> extends DurableWorkflowContext<TMetadata> {
  constructor(
    protected ctx: LiveConfig<unknown, LiveState, TManifest>,
    execution: WorkflowExecution<Arg, unknown, TMetadata>,
  ) {
    super(execution);
  }

  public invoke<
    TInvocableKey extends
      | AvailableFunctions<TManifest>
      | AvailableLoaders<TManifest>
      | AvailableActions<TManifest>,
    TFuncSelector extends TInvocableKey extends AvailableFunctions<TManifest>
      ? DotNestedKeys<ManifestFunction<TManifest, TInvocableKey>["return"]>
      : TInvocableKey extends AvailableActions<TManifest>
        ? DotNestedKeys<ManifestAction<TManifest, TInvocableKey>["return"]>
      : TInvocableKey extends AvailableLoaders<TManifest>
        ? DotNestedKeys<ManifestLoader<TManifest, TInvocableKey>["return"]>
      : never,
    TPayload extends Invoke<TManifest, TInvocableKey, TFuncSelector>,
  >(
    key: TInvocableKey,
    props?: Invoke<TManifest, TInvocableKey, TFuncSelector>["props"],
  ): LocalActivityCommand<
    InvokeResult<
      TPayload,
      TManifest
    >,
    [Invoke<TManifest, TInvocableKey, TFuncSelector>["props"]]
  > {
    const ctx = this.ctx;
    const fn = function (
      props?: Invoke<TManifest, TInvocableKey, TFuncSelector>["props"],
    ): Promise<
      InvokeResult<
        TPayload,
        TManifest
      >
    > {
      return ctx.invoke(key, props);
    };
    Object.defineProperty(fn, "name", { value: key });
    return {
      name: "local_activity",
      fn,
      args: [props],
    };
  }
}

export type Workflow = InstanceOf<typeof workflowBlock, "#/root/workflows">;

export type WorkflowFn<
  TConfig = any,
  // deno-lint-ignore ban-types
  TState = {},
  TArgs extends Arg = any,
  TResp = any,
  TMetadata extends Metadata = any,
  TManifest extends AppManifest = any,
  TContext extends WorkflowContext<TManifest, TMetadata> = any,
> = (
  config: TConfig,
  ctx: FnContext<TState, TManifest>,
) => DurableWorkflow<TArgs, TResp, TContext>;

const workflowBlock: Block<
  BlockModule<WorkflowFn>
> = {
  type: "workflows",
  adapt: <
    TConfig = any,
    // deno-lint-ignore ban-types
    TState = {},
  >(func: {
    default: WorkflowFn<TConfig, TState>;
  }) =>
  (
    $live: TConfig,
    ctx: HttpContext<{ global: any; response: { headers: Headers } }>,
  ) => {
    return func.default($live, fnContextFromHttpContext(ctx));
  },
};

/**
 * <TConfig>(config:TConfig) => Workflow
 * The workflow block.
 */
export default workflowBlock;
