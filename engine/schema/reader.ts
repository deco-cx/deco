import { Schemas } from "$live/engine/schema/builder.ts";
import { channel } from "$live/engine/schema/docServer.ts";
import { DecoManifest } from "$live/types.ts";
import { genSchemasFromManifest } from "./gen.ts";
import { stringifyForWrite } from "$live/utils/json.ts";

export const genSchemas = async (manifest: DecoManifest) => {
  console.log(`🌟 live.ts is spinning up some magic for you! ✨ Hold tight!`);
  const start = performance.now();
  const schema = await genSchemasFromManifest(
    manifest,
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

const cache: Record<string, Promise<Schemas>> = {};
export const getCurrent = (manifest: DecoManifest): Promise<Schemas> => {
  const key = JSON.stringify(manifest);
  return cache[key] ??= genSchemas(manifest);
};
