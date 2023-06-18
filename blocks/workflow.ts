// deno-lint-ignore-file no-explicit-any
import { applyConfigSync } from "$live/blocks/utils.ts";
import {
  Arg,
  InvokeHttpEndpointCommand,
  Metadata,
  Workflow as DurableWorkflow,
  WorkflowContext as DurableWorkflowContext,
} from "$live/deps.ts";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { Manifest } from "$live/live.gen.ts";
import { context } from "$live/live.ts";
import {
  AvailableActions,
  AvailableFunctions,
  AvailableLoaders,
  Invoke,
  ManifestAction,
  ManifestFunction,
  ManifestLoader,
} from "$live/routes/live/invoke/index.ts";
import { DecoManifest } from "$live/types.ts";
import { DotNestedKeys } from "$live/utils/object.ts";

const myUrl = () =>
  context.isDeploy
    ? `https://deco-sites-${context.site}-${context.deploymentId}.deno.dev/live/invoke`
    : "http://localhost:8000/live/invoke";

export interface WorkflowMetadata extends Metadata {
  defaultInvokeHeaders?: Record<string, string>;
}
export class WorkflowContext<
  TManifest extends DecoManifest = Manifest,
  TMetadata extends WorkflowMetadata = WorkflowMetadata,
> extends DurableWorkflowContext<TMetadata> {
  constructor(executionId: string, metadata?: TMetadata) {
    super(executionId, metadata);
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
  >(
    key: TInvocableKey,
    props?: Invoke<TManifest, TInvocableKey, TFuncSelector>["props"],
    headers?: Record<string, string>,
  ): InvokeHttpEndpointCommand<
    Invoke<TManifest, TInvocableKey, TFuncSelector>["props"]
  > {
    return {
      name: "invoke_http_endpoint",
      url: `${myUrl()}/${key}`, // FIXME define the actual port
      method: "POST",
      body: props,
      headers: {
        ...(headers ?? {}),
        ...(this.metadata?.defaultInvokeHeaders ?? {}),
        "accept": "application/json",
      },
    };
  }
}

export type Workflow = InstanceOf<typeof workflowBlock, "#/root/workflows">;

export type WorkflowFn<
  TConfig = any,
  TArgs extends Arg = any,
  TResp = any,
  TMetadata extends Metadata = Metadata,
  TManifest extends DecoManifest = Manifest,
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
