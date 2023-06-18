// deno-lint-ignore-file no-explicit-any
import { Workflow, WorkflowFn } from "$live/blocks/workflow.ts";
import { workflowServiceInfo } from "$live/commons/workflows/serviceInfo.ts";
import {
  toExecution,
  WorkflowExecution,
} from "$live/commons/workflows/types.ts";
import { BlockFromKey, BlockFunc, BlockKeys } from "$live/engine/block.ts";
import { Manifest } from "$live/live.gen.ts";
import { DecoManifest } from "$live/types.ts";

export interface AnyWorkflow {
  id?: string;
  args?: any[];
  workflow: {
    data: Workflow;
    __resolveType: "resolved";
  }; // TODO(mcandeia) generics is not working Resolved<Workflow>;
}

export type WorkflowProps<
  key extends string = string,
  TManifest extends DecoManifest = Manifest,
  block extends BlockFromKey<key, TManifest> = BlockFromKey<key, TManifest>,
> = key extends BlockKeys<TManifest> & `${string}/workflows/${string}`
  ? BlockFunc<key, TManifest, block> extends
    WorkflowFn<infer TProps, infer TArgs>
    ? TArgs["length"] extends 0 ? { id?: string; key: key; props: TProps }
    : { id?: string; args: TArgs; key: key; props: TProps }
  : AnyWorkflow
  : AnyWorkflow;

export interface Props {
  id?: string;
}

const fromWorkflowProps = <
  key extends string = string,
  TManifest extends DecoManifest = Manifest,
  block extends BlockFromKey<key, TManifest> = BlockFromKey<key, TManifest>,
>(
  props: WorkflowProps<key, TManifest, block> | AnyWorkflow,
) => {
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
/**
 * @description Start the workflow execution with the given props and args. You can set the id of the workflow as you wish.
 */
export default async function startWorkflow<
  key extends string = string,
  TManifest extends DecoManifest = Manifest,
  block extends BlockFromKey<key, TManifest> = BlockFromKey<key, TManifest>,
>(
  props: WorkflowProps<key, TManifest, block> | AnyWorkflow,
): Promise<WorkflowExecution> {
  const { id, args } = props;
  const [service, serviceUrl] = workflowServiceInfo();
  const payload = {
    alias: `${service}/live/invoke/$live/actions/workflows/run.ts`,
    id,
    input: args,
    metadata: {
      workflow: fromWorkflowProps(props),
      __resolveType: "resolve",
    },
  };
  const resp = await fetch(`${serviceUrl}/executions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (resp.ok) {
    return toExecution(await resp.json());
  }
  throw new Error(`${resp.status}, ${JSON.stringify(payload)}`);
}
