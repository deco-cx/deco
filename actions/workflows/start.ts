// deno-lint-ignore-file no-explicit-any
import { WorkflowExecution } from "$live/deps.ts";
import { context } from "$live/live.ts";
export interface Props<
  TWorkflow extends `${string}/workflows/${string}` =
    `${string}/workflows/${string}`,
> {
  workflow: TWorkflow;
  id?: string;
  props?: any;
  args?: any[];
}

export const wkserviceInfo = () =>
  context.isDeploy
    ? [
      Deno.env.get("LIVE_WORKFLOW_REGISTRY") ??
        `deco-sites.${context.site}-${context.deploymentId}@`,
      Deno.env.get("LIVE_WORKFLOW_SERVICE_URL") ??
        "https://durable-workers.fly.dev",
    ]
    : [
      "local.",
      Deno.env.get("LIVE_WORKFLOW_SERVICE_URL") ?? "http:/localhost:8001",
    ];
export default async function startWorkflow(
  { workflow, props, args, id }: Props,
): Promise<WorkflowExecution> {
  const [service, serviceUrl] = wkserviceInfo();
  const payload = {
    alias: `${service}/live/invoke/$live/actions/workflows/run.ts`,
    id,
    input: args,
    metadata: {
      workflow: {
        ...props,
        __resolveType: workflow,
      },
      __resolveType: "resolve",
    },
  };
  const resp = await fetch(`${serviceUrl}/executions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (resp.ok) {
    return resp.json();
  }
  throw new Error(`${resp.status}, ${JSON.stringify(payload)}`);
}
