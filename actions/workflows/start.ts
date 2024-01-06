// deno-lint-ignore-file no-explicit-any
import { Workflow, WorkflowFn } from "../../blocks/workflow.ts";
import { start } from "../../commons/workflows/initialize.ts"; // side-effect initialize
import {
  toExecution,
  WorkflowExecution,
  WorkflowMetadata,
} from "../../commons/workflows/types.ts";
import { Arg, RuntimeParameters, WorkflowExecutionBase } from "../../deps.ts";
import { BlockFromKey, BlockFunc, BlockKeys } from "../../engine/block.ts";
import { Resolvable } from "../../engine/core/resolver.ts";
import { Context } from "../../deco.ts";
import { AppManifest } from "../../types.ts";

export interface CommonProps<
  TMetadata extends WorkflowMetadata = WorkflowMetadata,
> {
  restart?: boolean;
  id?: string;
  metadata?: TMetadata;
  runtimeParameters?: RuntimeParameters;
}
export interface AnyWorkflow extends CommonProps {
  args?: readonly any[];
  workflow: {
    data: Workflow;
    __resolveType: "resolved";
  }; // TODO(mcandeia) generics is not working Resolved<Workflow>;
}

export type WorkflowProps<
  key extends string = string,
  TManifest extends AppManifest = AppManifest,
  block extends BlockFromKey<key, TManifest> = BlockFromKey<key, TManifest>,
> = key extends BlockKeys<TManifest> & `${string}/workflows/${string}`
  ? BlockFunc<key, TManifest, block> extends
    WorkflowFn<infer TProps, any, infer TArgs>
    ? TArgs["length"] extends 0 ? { key: key; props: TProps } & CommonProps
    : { args: TArgs; key: key; props: TProps } & CommonProps
  : AnyWorkflow
  : AnyWorkflow;

const fromWorkflowProps = <
  key extends string = string,
  TManifest extends AppManifest = AppManifest,
  block extends BlockFromKey<key, TManifest> = BlockFromKey<key, TManifest>,
>(
  props: WorkflowProps<key, TManifest, block> | AnyWorkflow,
): Resolvable<Workflow> => {
  const anyProps = props as AnyWorkflow;
  if (
    anyProps?.workflow?.__resolveType &&
    (anyProps.workflow.__resolveType !== "resolved")
  ) {
    return anyProps.workflow;
  }
  const wkflowProps = props as any as { key: string; props: any };
  return { ...(wkflowProps.props ?? {}), __resolveType: wkflowProps?.key };
};

const WORKFLOW_QS = "workflow";
export const WorkflowQS = {
  buildFromProps: (workflow: ReturnType<typeof fromWorkflowProps>): string => {
    return `${WORKFLOW_QS}=${
      encodeURIComponent(btoa(JSON.stringify(workflow)))
    }`;
  },
  extractFromUrl: (
    urlString: string,
  ): Resolvable<Workflow> | undefined => {
    const url = new URL(urlString);
    const qs = url.searchParams.get(WORKFLOW_QS);
    if (!qs) {
      return undefined;
    }
    return JSON.parse(atob(decodeURIComponent(qs)));
  },
};
/**
 * @description Start the workflow execution with the given props and args. You can set the id of the workflow as you wish.
 */
export default async function startWorkflow<
  key extends string = string,
  TManifest extends AppManifest = AppManifest,
  block extends BlockFromKey<key, TManifest> = BlockFromKey<key, TManifest>,
>(
  props: WorkflowProps<key, TManifest, block> | AnyWorkflow,
): Promise<WorkflowExecution> {
  const { id, args, runtimeParameters } = props;
  const workflow = fromWorkflowProps(props);
  const context = Context.active();
  const service = context.isDeploy
    ? Deno.env.get("MY_DURABLE_URL") ??
      `wss://deco-sites-${context.site}-${context.deploymentId}.deno.dev`
    : "ws://localhost:8000";

  const url = new URL(
    `${service}/live/workflows/run?${WorkflowQS.buildFromProps(workflow)}`,
  );

  for (
    const [key, value] of Object.entries(
      runtimeParameters?.websocket?.defaultQueryParams ?? {},
    )
  ) {
    url.searchParams.set(key, value);
  }
  const payload: WorkflowExecutionBase = {
    workflow: {
      type: "websocket",
      url: url.toString(),
    },
    id,
    input: args,
    namespace: context.site,
    runtimeParameters,
    metadata: {
      workflow: fromWorkflowProps(props),
      ...(props?.metadata ?? {}),
    },
  };
  return await start<Arg, unknown, WorkflowMetadata>(payload, props?.restart)
    .then(toExecution);
}
