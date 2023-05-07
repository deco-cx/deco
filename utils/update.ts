export * from "https://denopkg.com/hayd/deno-udd@master/mod.ts";
import { join } from "https://deno.land/std@0.181.0/path/mod.ts";
import {
  lookup,
  REGISTRIES,
} from "https://denopkg.com/hayd/deno-udd@master/registry.ts";
import { brightYellow } from "std/fmt/colors.ts";

const packagesThatShouldBeChecked = ["$live/", "deco-sites/std/"];
const getImportMap = async (dir: string): Promise<
  [{ imports: Record<string, string> }, string]
> => {
  const denoJSON = await Deno.readTextFile(join(dir, "deno.json")).then(
    JSON.parse,
  );
  const importMapFile = denoJSON?.importMap ?? "./import_map.json";
  const importMapPath = join(dir, importMapFile.replace("./", ""));
  return [
    await Deno.readTextFile(importMapPath).then(JSON.parse),
    importMapPath,
  ];
};

export const checkUpdates = async (dir?: string) => {
  const [importMap, importMapPath] = await getImportMap(dir ?? Deno.cwd());
  const updates: Record<string, string> = {};
  for (const pkg of packagesThatShouldBeChecked) {
    const importUrl = importMap.imports[pkg];
    if (!importUrl) {
      continue;
    }
    const url = lookup(importUrl, REGISTRIES);
    if (!url) {
      continue;
    }
    const versions = await url.all();
    const currentVersion = url.version();
    const latestVersion = versions[0];
    if (currentVersion !== latestVersion) {
      console.log(
        brightYellow(
          `Update available for ${pkg} ${currentVersion} -> ${latestVersion}.`,
        ),
      );
      const shouldProceed = confirm("would you like to update?");
      if (shouldProceed) {
        updates[pkg] = url.at(latestVersion).url;
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    console.log("updating packages...");
    await Deno.writeTextFile(
      importMapPath,
      JSON.stringify(
        {
          ...importMap,
          imports: { ...importMap?.imports ?? {}, ...updates },
        },
        null,
        2,
      ),
    );
  }
};
