import { inspectVSCode } from "../../../deps.ts";
import { context } from "../../../live.ts";

export const handler = async (req: Request) => {
  const runtime = await context.runtime;

  return inspectVSCode.inspectHandler(
    `/live/inspect/${runtime?.manifest.name}`,
    req,
  );
};
