import { inspectVSCode } from "../../../deps.ts";
import { context } from "../../../live.ts";

export const handler = (req: Request) => {
  return inspectVSCode.inspectHandler(
    `/live/inspect/${context.namespace}`,
    req,
  );
};
