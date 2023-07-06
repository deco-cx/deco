import { HandlerContext } from "$fresh/server.ts";
import { WorkflowQS } from "$live/actions/workflows/start.ts";
import { Workflow, WorkflowContext } from "$live/blocks/workflow.ts";
import { workflowServiceInfo } from "$live/commons/workflows/serviceInfo.ts";
import {
  Arg,
  arrToStream,
  Command,
  fetchPublicKey,
  HttpRunRequest,
  InvalidSignatureError,
  Metadata,
  verifySignature,
  workflowRemoteRunner,
  workflowWebSocketHandler,
} from "$live/deps.ts";
import { LiveConfig } from "$live/mod.ts";
import { LiveState } from "$live/types.ts";

export type Props = HttpRunRequest<Arg, { workflow: Workflow } & Metadata>;

let key: Promise<JsonWebKey> | null = null;

const getOrFetchPublicKey = (): Promise<JsonWebKey> => {
  const [_, serviceUrl] = workflowServiceInfo();
  return key ??= fetchPublicKey(serviceUrl);
};

const verifyWithCurrentKeyOrRefetch = async (req: Request) => {
  try {
    await verifySignature(req, getOrFetchPublicKey());
  } catch (err) {
    if (!(err instanceof InvalidSignatureError)) {
      throw err;
    }
    console.log(
      "error when validating signature",
      err,
      "retrying with a new key",
    );
    key = null;
    await verifySignature(req, getOrFetchPublicKey());
  }
};

/**
 * Check if the request comes from durable and its signature is valid.
 */
export const isValidRequestFromDurable = async (req: Request) => {
  try {
    await verifyWithCurrentKeyOrRefetch(req);
    return true;
  } catch {
    return false;
  }
};

/**
 * @description Proceed the workflow execution based on the current state of the workflow.
 */
async function runWorkflow(
  props: Props,
): Promise<Command> {
  const { metadata: { workflow } } = props;
  const handler = workflowRemoteRunner(workflow, WorkflowContext);
  const events = arrToStream(props.results);
  await handler({ ...props, events });
  return events.nextCommand;
}

const handleProps = async (
  props: Props,
  ctx: HandlerContext<unknown, LiveConfig<unknown, LiveState>>,
) => {
  const metadata = await ctx.state.resolve(props?.metadata ?? {});
  return runWorkflow({ ...props, metadata });
};

export const handler = async (
  req: Request,
  ctx: HandlerContext<unknown, LiveConfig<unknown, LiveState>>,
) => {
  if (req.headers.get("upgrade") === "websocket") {
    const workflow = WorkflowQS.extractFromUrl(req.url);
    if (!workflow) {
      return new Response(null, { status: 501 });
    }
    const workflowFn = await ctx.state.resolve(workflow);
    const handler = workflowWebSocketHandler(
      workflowFn,
      WorkflowContext,
      await getOrFetchPublicKey(),
    );
    return handler(req, ctx);
  }
  const verifyPromise = verifyWithCurrentKeyOrRefetch(req);
  const props: Props = await req.json();
  await verifyPromise;
  const resp = await handleProps(props, ctx);
  return new Response(
    JSON.stringify(resp),
    { status: 200 },
  );
};
