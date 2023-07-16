// deno-lint-ignore-file no-explicit-any
import {
  Workflow,
  WorkflowFn,
  WorkflowMetadata,
} from "$live/blocks/workflow.ts";
import {
  signedFetch,
  workflowServiceInfo,
} from "$live/commons/workflows/serviceInfo.ts";
import {
  toExecution,
  WorkflowExecution,
} from "$live/commons/workflows/types.ts";
import { RuntimeParameters } from "$live/deps.ts";
import { BlockFromKey, BlockFunc, BlockKeys } from "$live/engine/block.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { Manifest } from "$live/live.gen.ts";
import { DecoManifest } from "$live/types.ts";

export interface CommonProps<
  TMetadata extends WorkflowMetadata = WorkflowMetadata,
> {
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
  TManifest extends DecoManifest = Manifest,
  block extends BlockFromKey<key, TManifest> = BlockFromKey<key, TManifest>,
> = key extends BlockKeys<TManifest> & `${string}/workflows/${string}`
  ? BlockFunc<key, TManifest, block> extends
    WorkflowFn<infer TProps, infer TArgs>
    ? TArgs["length"] extends 0 ? { key: key; props: TProps } & CommonProps
    : { args: TArgs; key: key; props: TProps } & CommonProps
  : AnyWorkflow
  : AnyWorkflow;

const fromWorkflowProps = <
  key extends string = string,
  TManifest extends DecoManifest = Manifest,
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
  TManifest extends DecoManifest = Manifest,
  block extends BlockFromKey<key, TManifest> = BlockFromKey<key, TManifest>,
>(
  props: WorkflowProps<key, TManifest, block> | AnyWorkflow,
): Promise<WorkflowExecution> {
  const { id, args, runtimeParameters } = props;
  const [service, serviceUrl] = workflowServiceInfo();
  const workflow = fromWorkflowProps(props);
  const payload = {
    alias: `${service}/live/workflows/run?${
      WorkflowQS.buildFromProps(workflow)
    }`,
    id,
    input: args,
    runtimeParameters,
    metadata: {
      workflow: fromWorkflowProps(props),
      ...(props?.metadata ?? {}),
    },
  };
  const resp = await signedFetch(`${serviceUrl}/executions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (resp.ok) {
    return toExecution(await resp.json());
  }
  throw new Error(`${resp.status}, ${JSON.stringify(payload)}`);
}
