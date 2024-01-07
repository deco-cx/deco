import { inspectVSCode } from "../../../deps.ts";
import { Context } from "../../../deco.ts";

export const handler = async (req: Request) => {
  const runtime = await Context.active().runtime;

  return inspectVSCode.inspectHandler(
    `/live/inspect/${runtime?.manifest.name}`,
    req,
  );
};
