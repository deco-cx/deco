import { parse } from "https://deno.land/std@0.204.0/flags/mod.ts";
import * as colors from "https://deno.land/std@0.204.0/fmt/colors.ts";
import { join } from "https://deno.land/std@0.204.0/path/mod.ts";
import * as semver from "https://deno.land/x/semver@v1.4.1/mod.ts";
import {
  lookup,
  REGISTRIES,
} from "https://denopkg.com/hayd/deno-udd@0.8.2/registry.ts";
import { stringifyForWrite } from "../utils/json.ts";


// map of `packageAlias` to `packageRepo`
const PACKAGES_TO_CHECK =
  /(apps)|(deco)|(\$live)|(deco-sites\/.*\/$)|(partytown)/;

interface ImportMap {
  imports: Record<string, string>;
}

const getImportMap = async (dir: string): Promise<[ImportMap, string]> => {
  const denoJSONPath = join(dir, "deno.json");
  const denoJSON = await Deno.readTextFile(denoJSONPath).then(JSON.parse);
  // inlined import_map inside deno.json
  if (denoJSON.imports) {
    return [denoJSON, denoJSONPath];
  }

  const importMapFile = denoJSON?.importMap ?? "./import_map.json";
  const importMapPath = join(dir, importMapFile.replace("./", ""));
  return [
    await Deno.readTextFile(importMapPath).then(JSON.parse),
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

        if (!semver.valid(currentVersion) && !Deno.args.includes("force")) {
          console.log(
            colors.yellow(`skipping ${pkg} ${currentVersion} -> ${latestVersion}. Use --force to upgrade.`),
          );
          return;
        }

        if (currentVersion !== latestVersion) {
          console.info(
            `Upgrading ${pkg} ${currentVersion} -> ${latestVersion}.`,
          );

          upgradeFound = true;
          importMap.imports[pkg] = url.at(latestVersion).url;
        }
      }),
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
