import * as semver from "https://deno.land/x/semver@v1.4.1/mod.ts";
import {
  lookup,
  REGISTRIES,
} from "https://denopkg.com/hayd/deno-udd@0.8.2/registry.ts";
import { parse } from "https://deno.land/std@0.204.0/flags/mod.ts";
import { join } from "https://deno.land/std@0.204.0/path/mod.ts";
import { stringifyForWrite } from "../utils/json.ts";
import { parse as jsoncParse } from "https://deno.land/std@0.204.0/jsonc/mod.ts";

async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

// map of `packageAlias` to `packageRepo`
const PACKAGES_TO_CHECK =
  /(apps)|(deco)|(\$live)|(deco-sites\/.*\/$)|(partytown)/;

type ImportMap = Record<string, string>;
type ImportMapFile = { imports: ImportMap };
type DenoJson = {
  imports?: ImportMap;
  importMap?: string;
};

const getImportMap = async (dir: string): Promise<[ImportMapFile, string]> => {
  let denoJsonFile = "";

  const jsonPath = join(dir, "deno.json");
  const jsoncPath = join(dir, "deno.jsonc");

  if (await exists(jsonPath)) {
    denoJsonFile = jsonPath;
  } else if (await exists(jsoncPath)) {
    denoJsonFile = jsoncPath;
  } else {
    throw new Error("No deno.json found");
  }

  const denoJSON = (await Deno.readTextFile(denoJsonFile).then(
    jsoncParse
  )) as DenoJson;

  // inlined import_map inside deno.json
  if (denoJSON.imports) {
    return [denoJSON as Required<Omit<DenoJson, "importMap">>, denoJsonFile];
  }

  const importMapFile = join(dir, denoJSON.importMap ?? "./import_map.json");

  if (!(await exists(importMapFile))) {
    throw new Error("No import_map found");
  }

  const importMapPath = importMapFile.replace("./", "");
  return [
    (await Deno.readTextFile(importMapPath).then(jsoncParse)) as ImportMapFile,
    importMapPath,
  ];
};

function eligibleLatestVersion(versions: string[]) {
  const flags = parse(Deno.args, {
    boolean: ["allow-pre"],
  });
  return flags["allow-pre"]
    ? versions[0]
    : versions.find((ver) => semver.parse(ver)?.prerelease?.length === 0);
}

async function update() {
  let upgradeFound = false;
  const [importMap, importMapPath] = await getImportMap(Deno.cwd());

  console.info("Looking up latest versions");

  await Promise.all(
    Object.keys(importMap.imports ?? {})
      .filter((pkg) => PACKAGES_TO_CHECK.test(pkg))
      .map(async (pkg) => {
        const url = lookup(importMap.imports[pkg], REGISTRIES);

        if (!url) return;

        const versions = await url.all();
        const currentVersion = url.version();
        const latestVersion = eligibleLatestVersion(versions);

        if (!latestVersion) {
          return;
        }

        if (currentVersion !== latestVersion) {
          console.info(
            `Upgrading ${pkg} ${currentVersion} -> ${latestVersion}.`
          );

          upgradeFound = true;
          importMap.imports[pkg] = url.at(latestVersion).url;
        }
      })
  );

  if (!importMap.imports["deco/"] && importMap.imports["$live/"]) {
    console.info("Add deco/ alias");
    importMap.imports["deco/"] = importMap.imports["$live/"];
  }

  if (!upgradeFound) {
    console.info("Local website depends on the most recent releases of Live!");
    return;
  }

  await Deno.writeTextFile(importMapPath, stringifyForWrite(importMap));
  console.info("Upgraded successfully");
}

await update();
