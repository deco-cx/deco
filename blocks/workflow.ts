// deno-lint-ignore-file no-explicit-any
import {
  InvokeHttpEndpointCommand,
  Workflow as DurableWorkflow,
  WorkflowContext as DurableWorkflowContext,
} from "$durable/mod.ts";
import { applyConfig } from "$live/blocks/utils.ts";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { context } from "$live/live.ts";
import { Manifest } from "../live.gen.ts";
import {
  AvailableActions,
  AvailableFunctions,
  AvailableLoaders,
  Invoke,
  ManifestAction,
  ManifestFunction,
  ManifestLoader,
} from "../routes/live/invoke/index.ts";
import { DecoManifest } from "../types.ts";
import { DotNestedKeys } from "../utils/object.ts";

export class WorkflowContext<TManifest extends DecoManifest = Manifest>
  extends DurableWorkflowContext {
  constructor(executionId: string) {
    super(executionId);
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
    TPayload extends
      | Invoke<TManifest, TInvocableKey, TFuncSelector>
      | Record<
        string,
        Invoke<TManifest, TInvocableKey, TFuncSelector>
      >,
  >(body: TPayload): InvokeHttpEndpointCommand<TPayload> {
    return {
      name: "invoke_http_endpoint",
      url: context.isDeploy
        ? `https://deco-sites-${context.site}-${context.deploymentId}.deno.dev/live/invoke`
        : "http://localhost:8000/live/invoke", // FIXME define the actual port
      method: "POST",
      body,
      headers: {
        "accept": "application/json",
      },
    };
  }
}

export type Workflow = InstanceOf<typeof workflowBlock, "#/root/workflows">;

export type WorkflowFn<TConfig = any> = (
  c: TConfig,
) => DurableWorkflow<any, any, WorkflowContext>;

const workflowBlock: Block<BlockModule<WorkflowFn>> = {
  type: "workflows",
  introspect: {
    default: "0",
  },
  adapt: applyConfig,
};

/**
 * <TConfig>(config:TConfig) => Workflow
 * The account block is used to configure platforms using settings
 */
export default workflowBlock;
