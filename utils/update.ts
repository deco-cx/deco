import * as semver from "https://deno.land/x/semver@v1.4.1/mod.ts";
import {
  lookup,
  REGISTRIES,
} from "https://denopkg.com/hayd/deno-udd@0.8.2/registry.ts";
import { brightYellow } from "std/fmt/colors.ts";
import { join } from "std/path/mod.ts";
import { printDiff } from "../scripts/changelog.ts";

// map of `packageAlias` to `packageRepo`
const PACKAGES_TO_CHECK = /(\$live)|(deco-sites\/.*\/$)/;

interface ImportMap {
  imports: Record<string, string>;
}

const getImportMap = async (dir: string): Promise<
  [ImportMap, string]
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

export async function update() {
  let upgradeFound = false;
  const [importMap, importMapPath] = await getImportMap(Deno.cwd());

  console.info("Looking up latest versions");

  const newImportMap = Object.keys(importMap.imports ?? {}).reduce(
    async (importMapPromise, pkg) => {
      const importMap = await importMapPromise;

      if (!PACKAGES_TO_CHECK.test(pkg)) return importMap;

      const url = lookup(importMap.imports[pkg], REGISTRIES);

      if (!url) return importMap;

      const versions = await url.all();
      const currentVersion = url.version();
      const latestVersion = versions[0];

      if (currentVersion !== latestVersion) {
        console.info(
          `Enqueueing upgrade ${pkg} ${currentVersion} -> ${latestVersion}.`,
        );

        upgradeFound = true;
        importMap.imports[pkg] = url.at(latestVersion).url;
      }

      return importMap;
    },
    Promise.resolve(Object.assign({ imports: {} }, importMap)),
  );

  if (!upgradeFound) {
    console.info("Local website depends on the most recent releases of Live!");
    return;
  }

  await Deno.writeTextFile(
    importMapPath,
    JSON.stringify(newImportMap, null, 2),
  );
  console.info("Upgraded successfully");
}

const hasUpdates = async (importMap: ImportMap) => {
  for (const pkg of Object.keys(importMap.imports ?? {})) {
    if (!PACKAGES_TO_CHECK.test(pkg)) continue;

    const url = lookup(importMap.imports[pkg], REGISTRIES);

    if (!url) continue;

    const versions = await url.all();
    const currentVersion = url.version();
    const latestVersion = versions[0];

    if (currentVersion !== latestVersion) return true;
  }

  return false;
};

export async function checkUpdates(_dir?: string) {
  const [importMap] = await getImportMap(_dir ?? Deno.cwd());

  const shouldWarn = await hasUpdates(importMap);

  if (shouldWarn) {
    console.log(
      `%c 🐁 Live updates available! %c To upgrade, run:`,
      "background-color: #2FD080; color: white; font-weight: bold",
      "",
    );
    console.log(`deno run -A $live/scripts/update.ts`);
  }
}
