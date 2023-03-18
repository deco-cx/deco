import { HandlerContext } from "$fresh/server.ts";
import {
  decoManifestBuilder,
  listBlocks,
} from "$live/engine/fresh/manifestGen.ts";
import { context } from "$live/live.ts";
import { newSchemaBuilder } from "$live/engine/schema/builder.ts";

export const handler = async (_: Request, __: HandlerContext) => {
  const dir = Deno.cwd();
  const manifest = await decoManifestBuilder(dir, context.namespace!);
  const schemas = newSchemaBuilder(manifest.data.schemaData);

  const entries = [];

  for await (const entry of listBlocks(dir)) {
    entries.push(entry);
  }

  return Response.json(
    {
      schemas: schemas.build(dir, context.namespace!),
      data: manifest.data,
      entries,
    },
  );
};
