import manifest from "./deco.gen.ts";
import { start } from "$live/main.ts";
import { DecoManifest } from "$live/types.ts";

await start(manifest as DecoManifest);
