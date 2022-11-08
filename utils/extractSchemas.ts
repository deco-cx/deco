import { exec, OutputMode } from "https://deno.land/x/exec/mod.ts";
import { dirname, fromFileUrl, join, toFileUrl } from "std/path/mod.ts";
import { collectFilesFromDir } from "../dev.ts";
import { getJsonSchemaFromDocs } from "./denoDoc.ts";

const sectionNames = await collectFilesFromDir(
  "/Users/lucis/deco/zeedog/sections"
);

await Promise.all(
  sectionNames.slice(0, 1).map(async (section) => {
    const pathForDenoDoc = `/Users/lucis/deco/zeedog/sections/${section}`;
    const { output: rawOutput } = await exec(
      `deno doc ${pathForDenoDoc} --json`,
      {
        output: OutputMode.Capture,
      }
    );
    const denoDocOutput = JSON.parse(rawOutput);

    const sectionSchema = getJsonSchemaFromDocs(
      denoDocOutput,
      `Section ${section}`
    );

    console.log(JSON.stringify(sectionSchema, null, 2))

  })
);

