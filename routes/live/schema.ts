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
    const p = Deno.run({
      cmd: ["deno", "doc", "--json", entry.path],
      stdout: "piped",
      stderr: "piped",
      stdin: "null",
    });
    try {
      entries.push({ path: entry.path });
      const s = await p.status();
      entries.push(s);
      entries.push(await p.output());
    } catch (err) {
      entries.push({ err });
    } finally {
      p.close();
    }
  }

  return Response.json(
    {
      schemas: schemas.build(dir, context.namespace!),
      data: manifest.data,
      entries,
    },
  );
};
