import type { HandlerContext } from "$fresh/server.ts";
import type { ConnInfo } from "std/http/server.ts";
import { type Workflow, WorkflowContext } from "../../../blocks/workflow.ts";
import { initOnce } from "../../../commons/workflows/initialize.ts";
import {
  type WorkflowMetadata,
  WorkflowQS,
} from "../../../commons/workflows/types.ts";
import {
  arrToStream,
  type Command,
  type HttpRunRequest,
  type Metadata,
  workflowRemoteRunner,
  workflowWebSocketHandler,
} from "../../../deps.ts";
import type { AppManifest, DecoState } from "../../../mod.ts";
import type { DecoSiteState } from "../../../types.ts";

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
  ctx: HandlerContext<unknown, DecoState<unknown, DecoSiteState, AppManifest>>,
) => {
  const metadata = await ctx.state.resolve<WorkflowMetadata>(
    (props?.execution?.metadata ?? {}) as WorkflowMetadata,
  );
  return runWorkflow(
    { ...props, execution: { ...props.execution, metadata } },
    ctx.state,
  );
};

export const handler = async (
  req: Request,
  ctx: HandlerContext<unknown, DecoState<unknown, DecoSiteState>>,
): Promise<Response> => {
  initOnce();
  if (req.headers.get("upgrade") === "websocket") {
    const workflow = WorkflowQS.extractFromUrl(req.url);
    if (!workflow) {
      return new Response(null, { status: 501 });
    }
    const workflowFn = await ctx.state.resolve(workflow);
    const handler = workflowWebSocketHandler(
      workflowFn,
      (execution) =>
        new WorkflowContext(
          ctx.state as unknown as DecoState<
            unknown,
            DecoSiteState,
            AppManifest
          >,
          execution,
        ),
    );
    return handler(req, ctx as ConnInfo);
  }
  const props: Props = await req.json();
  const resp = await handleProps(
    props,
    ctx as unknown as HandlerContext<
      unknown,
      DecoState<unknown, DecoSiteState, AppManifest>
    >,
  );
  return new Response(
    JSON.stringify(resp),
    { status: 200 },
  );
};
