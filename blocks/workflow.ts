// deno-lint-ignore-file no-explicit-any
import {
  type Arg,
  type LocalActivityCommand,
  type Metadata,
  type Workflow as DurableWorkflow,
  WorkflowContext as DurableWorkflowContext,
  type WorkflowExecution,
} from "../deps.ts";
import type { Block, BlockModule, InstanceOf } from "../engine/block.ts";
import type {
  AvailableActions,
  AvailableFunctions,
  AvailableLoaders,
  Invoke,
  InvokeResult,
  ManifestAction,
  ManifestFunction,
  ManifestLoader,
} from "../utils/invoke.types.ts";
import type { AppManifest, DecoSiteState, DecoState } from "../types.ts";
import type { DotNestedKeys } from "../utils/object.ts";
import type { HttpContext } from "./handler.ts";
import {
  type FnContext,
  fnContextFromHttpContext,
  type RequestState,
} from "./utils.tsx";

export interface WorkflowMetadata extends Metadata {
  defaultInvokeHeaders?: Record<string, string>;
}
export class WorkflowContext<
  TManifest extends AppManifest = AppManifest,
  TMetadata extends WorkflowMetadata = WorkflowMetadata,
> extends DurableWorkflowContext<TMetadata> {
  constructor(
    public state: DecoState<unknown, DecoSiteState, TManifest>,
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
    const ctx = this.state;
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
  TProps = any,
  // deno-lint-ignore ban-types
  TState = {},
  TArgs extends Arg = any,
  TResp = any,
  TMetadata extends Metadata = any,
  TManifest extends AppManifest = any,
  TContext extends WorkflowContext<TManifest, TMetadata> = any,
> = (
  props: TProps,
  ctx: FnContext<TState, TManifest>,
) => DurableWorkflow<TArgs, TResp, TContext>;

export type NamedWorkflow<
  TProps = any,
  TArgs extends Arg = Arg,
  TResp = unknown,
  TCtx extends WorkflowContext = WorkflowContext,
> = DurableWorkflow<TArgs, TResp, TCtx> & {
  key: string;
  props: TProps;
};

const workflowBlock: Block<
  BlockModule<WorkflowFn, DurableWorkflow, NamedWorkflow>
> = {
  type: "workflows",
  adapt: <
    TProps = any,
    // deno-lint-ignore ban-types
    TState = {},
  >(func: {
    default: WorkflowFn<TProps, TState>;
  }, key: string) =>
  (
    props: TProps,
    ctx: HttpContext<{ global: any } & RequestState>,
  ) => {
    const durableWorkflow = func.default(
      props,
      fnContextFromHttpContext(ctx),
    ) as NamedWorkflow;
    durableWorkflow.key = key;
    durableWorkflow.props = props;
    return durableWorkflow;
  },
};

/**
 * <TConfig>(config:TConfig) => Workflow
 * The workflow block.
 */
export default workflowBlock;
