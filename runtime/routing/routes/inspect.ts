import { Context } from "../../../deco.ts";
import { inspectVSCode } from "../../../deps.ts";
import type { DecoHandler } from "../middleware.ts";

export const handler: DecoHandler = async ({ req: { raw: req } }) => {
  const runtime = await Context.active().runtime;

  return inspectVSCode.inspectHandler(
    `/live/inspect/${runtime?.manifest.name}`,
    req,
  );
};
