import { loadFromBinary } from "../engine/schema/docCache.ts";

const stdinContent = await Deno.readAll(Deno.stdin);

console.log(JSON.stringify(loadFromBinary(stdinContent)));
