import { HandlerContext } from "$fresh/server.ts";
import { decoManifestBuilder } from "$live/engine/fresh/manifestGen.ts";
import { context } from "$live/live.ts";
import { newSchemaBuilder } from "$live/engine/schema/builder.ts";
import { walk } from "https://deno.land/std@0.170.0/fs/walk.ts";

export const handler = async (_: Request, __: HandlerContext) => {
  const dir = Deno.cwd();
  const manifest = await decoManifestBuilder(dir, context.namespace!);
  const schemas = newSchemaBuilder(manifest.data.schemaData);
  const entries = [];
  const iter = walk(dir, {
    maxDepth: 5,
    includeDirs: false,
    exts: [".tsx", ".ts"],
  });

  for await (const entry of iter) {
    entries.push(entry);
  }

  return Response.json(
    {
      schemas: schemas.build(dir, context.namespace!),
      data: manifest.data,
      entries,
    },
    { headers: { "x-cwd": dir, "x-namespace": context.namespace! } },
  );
};
