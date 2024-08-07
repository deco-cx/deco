import { Context } from "../../deco.ts";
import { inspectHandler } from "../../deps.ts";
import { createHandler } from "../middleware.ts";

export const handler = createHandler(async ({ req: { raw: req } }) => {
  const runtime = await Context.active().runtime;

  return inspectHandler(
    `/live/inspect/${runtime?.manifest.name}`,
    req,
  );
});
