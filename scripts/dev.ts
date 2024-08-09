import { join } from "@std/path";
import denoJSON from "../deno.json" with { type: "json" };

const name = denoJSON.name;
const exports = denoJSON.exports;
const resetOrDecoFolder = Deno.args[0];

const denoJSONPath = join(Deno.cwd(), "deno.json");
const projectDenoJSON: typeof denoJSON = await Deno.readTextFile(
  denoJSONPath,
).then((str) => JSON.parse(str));
const entries: Record<string, string> = projectDenoJSON.imports;

const isReset = resetOrDecoFolder === "$";
for (const [key, value] of Object.entries(exports)) {
  const entryKey = key.replace(".", name);
  if (isReset) {
    delete entries[entryKey];
  } else {
    entries[entryKey] = value.replace(".", resetOrDecoFolder);
  }
}

await Deno.writeTextFile(
  denoJSONPath,
  JSON.stringify(projectDenoJSON, null, 2),
);
