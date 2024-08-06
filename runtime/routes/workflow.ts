import type { ConnInfo } from "std/http/server.ts";
import { type Workflow, WorkflowContext } from "../../blocks/workflow.ts";
import { initOnce } from "../../commons/workflows/initialize.ts";
import {
  type WorkflowMetadata,
  WorkflowQS,
} from "../../commons/workflows/types.ts";
import {
  arrToStream,
  type Command,
  type HttpRunRequest,
  type Metadata,
  workflowRemoteRunner,
  workflowWebSocketHandler,
} from "../../deps.ts";
import type { AppManifest, DecoState } from "../../mod.ts";
import type { DecoSiteState } from "../../types.ts";
import { createHandler, type DecoMiddlewareContext } from "../middleware.ts";

export type Props = HttpRunRequest<
  unknown[],
  unknown,
  { workflow: Workflow } & Metadata
>;

/**
 * @description Proceed the workflow execution based on the current state of the workflow.
 */
async function runWorkflow(
  props: Props,
  ctx: DecoState<unknown, DecoSiteState, AppManifest>,
): Promise<Command> {
  const { execution: { metadata } } = props;
  const workflow = metadata!.workflow;
  const handler = workflowRemoteRunner(
    workflow,
    (execution) => new WorkflowContext(ctx, execution),
  );
  const commands = arrToStream(props.results);
  await handler({ ...props, commands });
  return commands.nextCommand();
}

const handleProps = async (
  props: Props,
  ctx: DecoMiddlewareContext,
) => {
  const metadata = await ctx.var.resolve<WorkflowMetadata>(
    (props?.execution?.metadata ?? {}) as WorkflowMetadata,
  );
  return runWorkflow(
    { ...props, execution: { ...props.execution, metadata } },
    ctx.var,
  );
};

export const handler = createHandler(async (
  ctx,
): Promise<Response> => {
  initOnce();
  const { req: { raw: req } } = ctx;
  if (req.headers.get("upgrade") === "websocket") {
    const workflow = WorkflowQS.extractFromUrl(req.url);
    if (!workflow) {
      return new Response(null, { status: 501 });
    }
    const workflowFn = await ctx.var.resolve(workflow);
    const handler = workflowWebSocketHandler(
      workflowFn,
      (execution) =>
        new WorkflowContext(
          ctx.var,
          execution,
        ),
    );
    return handler(req, ctx as unknown as ConnInfo);
  }
  const props: Props = await req.json();
  const resp = await handleProps(
    props,
    ctx,
  );
  return new Response(
    JSON.stringify(resp),
    { status: 200 },
  );
});
