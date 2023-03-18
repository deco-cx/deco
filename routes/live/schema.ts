import { HandlerContext } from "$fresh/server.ts";
import { decoManifestBuilder } from "$live/engine/fresh/manifestGen.ts";
import { newSchemaBuilder } from "$live/engine/schema/builder.ts";
import { context } from "$live/live.ts";

export const handler = async (_: Request, __: HandlerContext) => {
  const dir = Deno.cwd();
  const manifest = await decoManifestBuilder(dir, context.namespace!);
  const schemas = newSchemaBuilder(manifest.data.schemaData);

  return Response.json(
    {
      schemas: schemas.build(dir, context.namespace!),
      data: manifest.data,
    },
  );
};
