import {
  lookup,
  REGISTRIES,
} from "https://denopkg.com/hayd/deno-udd@0.8.2/registry.ts";
import { brightYellow } from "std/fmt/colors.ts";
import { join } from "std/path/mod.ts";
import { printDiff } from "../scripts/changelog.ts";

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

const ANSWERED = "LIVE_UPDATE_ANSWERED";

const tryReadChangelogMD = (url: string): Promise<string> => {
  return fetch(`${url}CHANGELOG.md`).then((r) => r.text());
};

export const checkUpdates = async (dir?: string) => {
  if (Deno.env.has(ANSWERED)) { // once per `deno task start`
    return;
  }
  const [importMap, importMapPath] = await getImportMap(dir ?? Deno.cwd());
  const updates: Record<string, string> = {};
  for (const pkg of packagesThatShouldBeChecked) {
    const importUrl = importMap.imports[pkg];
    if (!importUrl) {
      continue;
    }
    const url = lookup(
      importUrl,
      REGISTRIES,
    );
    if (!url) {
      continue;
    }
    const versions = await url.all();
    const currentVersion = url.version();
    const latestVersion = versions[0];
    if (currentVersion !== latestVersion) {
      const latestUrl = url.at(latestVersion).url;
      const changelogMD = await tryReadChangelogMD(
        latestUrl,
      ).catch(() => undefined);
      if (changelogMD) {
        console.log(); // breakline
        printDiff(currentVersion, changelogMD);
      }
      console.log(
        brightYellow(
          `Update available for ${pkg} ${currentVersion} -> ${latestVersion}.`,
        ),
      );
      const shouldProceed = confirm("would you like to update?");
      if (shouldProceed) {
        updates[pkg] = latestUrl;
      }
    }
    Deno.env.set("LIVE_UPDATE_ANSWERED", "true");
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
