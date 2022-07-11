import manifest from "./deco.gen.ts";
import { start } from "$deco/main.ts";
import { DecoManifest } from "$deco/types.ts";

await start(manifest as DecoManifest);
