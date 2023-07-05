import { HandlerContext } from "$fresh/server.ts";
import { Workflow, WorkflowContext } from "$live/blocks/workflow.ts";
import { workflowServiceInfo } from "$live/commons/workflows/serviceInfo.ts";
import {
    Arg,
    Command,
    InvalidSignatureError,
    Metadata,
    RunRequest,
    fetchPublicKey,
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
async function runWorkflow(
  props: Props,
  req: Request,
): Promise<Command> {
  await verifyWithCurrentKeyOrRefetch(req);
  const { metadata: { workflow } } = props;
  const handler = workflowRemoteRunner(workflow, WorkflowContext);
  return handler(props);
}

export const handler = async (
  req: Request,
  ctx: HandlerContext<unknown, LiveConfig<unknown, LiveState>>,
) => {
  const props: Props = await req.json();
  const metadata = await ctx.state.resolve(props?.metadata ?? {});
  return new Response(
    JSON.stringify(await runWorkflow({ ...props, metadata }, req)),
    { status: 200 },
  );
};
