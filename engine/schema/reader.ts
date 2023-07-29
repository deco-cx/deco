import { Schemas } from "$live/engine/schema/builder.ts";
import { context } from "$live/live.ts";
import { join } from "https://deno.land/std@0.61.0/path/mod.ts";
import { genSchemasFromManifest } from "./gen.ts";
import { stringifyForWrite } from "$live/utils/json.ts";

let schemas: Promise<Schemas> | null = null;
const schemaFile = "schemas.gen.json";

export const genSchemas = async () => {
  console.log(`🌟 live.ts is spinning up some magic for you! ✨ Hold tight!`);
  const start = performance.now();
  const schema = await genSchemasFromManifest(
    context.manifest!,
  );

  await Deno.writeTextFile(
    join(Deno.cwd(), schemaFile),
    stringifyForWrite(schema),
  );

  console.log(
    `✔️ ready to rock and roll! Your project is live 🤘 - took: ${
      Math.ceil(
        performance
          .now() - start,
      )
    }ms`,
  );
  return schema;
};

const getSchema = async (): Promise<Schemas> => {
  return await Deno.readTextFile(join(Deno.cwd(), schemaFile)).then(JSON.parse);
};

export const getCurrent = (): Promise<Schemas> => {
  return schemas ??= context.isDeploy ? getSchema() : genSchemas();
};

export const reset = () => {
  schemas = null;
};
