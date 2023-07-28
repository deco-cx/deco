import { Schemas } from "$live/engine/schema/builder.ts";
import { channel } from "$live/engine/schema/docServer.ts";
import { context } from "$live/live.ts";
import { genSchemasFromManifest } from "./gen.ts";
import { stringifyForWrite } from "$live/utils/json.ts";

let schemas: Promise<Schemas> | null = null;

export const genSchemas = async () => {
  console.log(`🌟 live.ts is spinning up some magic for you! ✨ Hold tight!`);
  const start = performance.now();
  const schema = await genSchemasFromManifest(
    context.manifest!,
  );

  if (channel) {
    (await channel)?.close();
  }

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

export const getCurrent = (): Promise<Schemas> => {
  return genSchemas();
};
