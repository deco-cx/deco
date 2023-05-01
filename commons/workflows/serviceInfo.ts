import { context } from "$live/live.ts";

export const workflowServiceInfo = () =>
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
