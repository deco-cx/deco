// deno-lint-ignore-file no-explicit-any
import { workflowServiceInfo } from "$live/commons/workflows/serviceInfo.ts";
import { Workflow } from "$live/blocks/workflow.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import {
  toExecution,
  WorkflowExecution,
} from "$live/commons/workflows/types.ts";

export interface WorkflowRef {
  key: string;
  props: any;
}
export interface Props {
  workflow: WorkflowRef | {
    ref: Workflow;
  };
  id?: string;
  args?: any[];
}

const isWorkflowRef = (ref: Props["workflow"]): ref is WorkflowRef =>
  (ref as WorkflowRef)?.key !== undefined &&
  (ref as Resolvable)?.__resolveType === undefined;
/**
 * @description Start the workflow execution with the given props and args. You can set the id of the workflow as you wish.
 */
export default async function startWorkflow(
  { workflow, args, id }: Props,
): Promise<WorkflowExecution> {
  const [service, serviceUrl] = workflowServiceInfo();
  const payload = {
    alias: `${service}/live/invoke/$live/actions/workflows/run.ts`,
    id,
    input: args,
    metadata: {
      workflow: isWorkflowRef(workflow)
        ? {
          ...workflow?.props,
          __resolveType: workflow.key,
        }
        : workflow.ref,
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
