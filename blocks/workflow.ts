// deno-lint-ignore-file no-explicit-any
import { applyConfigSync } from "$live/blocks/utils.ts";
import {
  Arg,
  LocalActivityCommand,
  Metadata,
  RuntimeParameters,
  Workflow as DurableWorkflow,
  WorkflowContext as DurableWorkflowContext,
} from "$live/deps.ts";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import type { Manifest } from "$live/live.gen.ts";
import {
  AvailableActions,
  AvailableFunctions,
  AvailableLoaders,
  Invoke,
  InvokeResult,
  ManifestAction,
  ManifestFunction,
  ManifestLoader,
} from "$live/routes/live/invoke/index.ts";
import { DecoManifest, LiveConfig, LiveState } from "$live/types.ts";
import { DotNestedKeys } from "$live/utils/object.ts";

export interface WorkflowMetadata extends Metadata {
  defaultInvokeHeaders?: Record<string, string>;
}
export class WorkflowContext<
  TManifest extends DecoManifest = Manifest,
  TMetadata extends WorkflowMetadata = WorkflowMetadata,
> extends DurableWorkflowContext<TMetadata> {
  constructor(
    protected ctx: LiveConfig<unknown, LiveState, TManifest>,
    executionId: string,
    metadata?: TMetadata,
    runtimeParameters?: RuntimeParameters,
  ) {
    super(executionId, metadata, runtimeParameters);
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
  TArgs extends Arg = any,
  TResp = any,
  TMetadata extends Metadata = Metadata,
  TManifest extends DecoManifest = any,
> = (
  c: TConfig,
) => DurableWorkflow<TArgs, TResp, WorkflowContext<TManifest, TMetadata>>;

const workflowBlock: Block<BlockModule<WorkflowFn>> = {
  type: "workflows",
  introspect: {
    default: "0",
  },
  adapt: applyConfigSync,
};

/**
 * <TConfig>(config:TConfig) => Workflow
 * The workflow block.
 */
export default workflowBlock;
