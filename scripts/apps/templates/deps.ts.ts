import { format } from "$live/dev.ts";
import { InitContext } from "$live/scripts/apps/init.ts";

export default async function AppLoadersBin({decoVersion}: InitContext) {
  return await format(
    `export * from "https://denopkg.com/deco-cx/deco@${decoVersion}/mod.ts";`,
  );
}
