import { HandlerContext } from "$fresh/server.ts";
import { Workflow, WorkflowContext } from "$live/blocks/workflow.ts";
import { workflowServiceInfo } from "$live/commons/workflows/serviceInfo.ts";
import {
  Arg,
  asVerifiedChannel,
  Channel,
  Command,
  fetchPublicKey,
  InvalidSignatureError,
  Metadata,
  RunRequest,
  verifySignature,
  workflowRemoteRunner,
} from "$live/deps.ts";
import { LiveConfig } from "$live/mod.ts";
import { LiveState } from "$live/types.ts";

export type Props = RunRequest<Arg, { workflow: Workflow } & Metadata>;

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
function runWorkflow(
  props: Props,
): Command {
  const { metadata: { workflow } } = props;
  const handler = workflowRemoteRunner(workflow, WorkflowContext);
  return handler(props);
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
    return webSocketHandler(req, ctx);
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

const useChannel = (
  ctx: HandlerContext<unknown, LiveConfig<unknown, LiveState>>,
) =>
async (chan: Channel<Command, Props>) => {
  while (!chan.closed.is_set()) {
    const props = await Promise.race([chan.recv(), chan.closed.wait()]);
    if (props === true) {
      return;
    }
    const cmd = await handleProps(props, ctx);
    if (chan.closed.is_set()) {
      return;
    }
    chan.send(cmd);
  }
};
const webSocketHandler = async (
  req: Request,
  ctx: HandlerContext<unknown, LiveConfig<unknown, LiveState>>,
) => {
  const { socket, response } = Deno.upgradeWebSocket(req);
  asVerifiedChannel<Command, Props>(socket, await getOrFetchPublicKey()).then(
    useChannel(ctx),
  ).catch((err) => {
    console.log("socket err", err);
    socket.close();
  });

  return response;
};
