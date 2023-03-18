import { HandlerContext } from "$fresh/server.ts";
import { decoManifestBuilder } from "$live/engine/fresh/manifestGen.ts";
import { context } from "$live/live.ts";
import { newSchemaBuilder } from "$live/engine/schema/builder.ts";

export const handler = async (_: Request, __: HandlerContext) => {
  const dir = Deno.cwd();
  const manifest = await decoManifestBuilder(dir, context.namespace!);
  const schemas = newSchemaBuilder(manifest.data.schemaData);

  return Response.json(
    schemas.build(dir, context.namespace!),
    { headers: { "x-cwd": dir, "x-namespace": context.namespace! } },
  );
};
