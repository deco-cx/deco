import { loadFromBinary, LOCATION_TAG } from "../engine/schema/docCache.ts";

const stdinContent = await Deno.readAll(Deno.stdin);

console.log(JSON.stringify(loadFromBinary(stdinContent, LOCATION_TAG)));
