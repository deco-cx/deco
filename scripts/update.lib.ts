import { parse } from "@std/flags";
import * as colors from "@std/fmt/colors";
import { join } from "@std/path";
import * as semver from "@std/semver";
import { pkgInfo } from "./pkg.ts";
import { lookup, REGISTRIES } from "./registry.ts";

interface ImportMap {
  imports: Record<string, string>;
}

const denoJSON: ImportMap = await fetch(
  "https://raw.githubusercontent.com/deco-cx/deco/main/deno.json",
).then(
  (res) => res.json(),
);

// map of `packageAlias` to `packageRepo`
const PACKAGES_TO_CHECK =
  /(@deco\/.*)|(apps)|(deco)|(\$live)|(deco-sites\/.*\/$)|(partytown)/;

const requiredMinVersion: Record<string, string> = {
  // "std/": "0.208.0",
};

const flags = parse(Deno.args, {
  boolean: ["allow-pre"],
});

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

async function upgradeImportMapDeps(
  importMap: ImportMap,
  logs = true,
  deps = PACKAGES_TO_CHECK,
) {
  let upgradeFound = false;
  logs && console.info("Looking up latest versions");

  await Promise.all(
    Object.keys(importMap.imports ?? {})
      .filter((pkg) => deps.test(pkg))
      .map(async (pkg) => {
        const info = await pkgInfo(importMap.imports[pkg], flags["allow-pre"]);

        if (!info?.versions?.latest) return;

        const {
          url,
          versions: { latest: latestVersion, current: currentVersion },
        } = info;

        if (!semver.canParse(currentVersion) && !Deno.args.includes("force")) {
          logs && console.log(
            colors.yellow(
              `skipping ${pkg} ${currentVersion} -> ${latestVersion}. Use --force to upgrade.`,
            ),
          );
          return;
        }

        if (currentVersion !== latestVersion) {
          logs && console.info(
            `Upgrading ${pkg} ${currentVersion} -> ${latestVersion}.`,
          );

          upgradeFound = true;
          importMap.imports[pkg] = url.at(latestVersion).url;
        }
      }),
  );

  if (!importMap.imports["deco/"] && importMap.imports["$live/"]) {
    logs && console.info("Add deco/ alias");
    importMap.imports["deco/"] = importMap.imports["$live/"];
  }

  for (const [pkg, minVer] of Object.entries(requiredMinVersion)) {
    if (importMap.imports[pkg]) {
      const url = lookup(importMap.imports[pkg], REGISTRIES);
      const currentVersion = url?.version();
      console.log({ currentVersion });
      if (
        !currentVersion ||
        semver.lessThan(semver.parse(currentVersion), semver.parse(minVer))
      ) {
        logs && console.info(
          `Upgrading ${pkg} ${currentVersion} -> ${minVer}.`,
        );

        upgradeFound = true;
        importMap.imports[pkg] = url?.at(minVer).url ?? importMap.imports[pkg];
      }
    }
  }

  if (!upgradeFound) {
    logs &&
      console.info(
        "Local website depends on the most recent releases of Live!",
      );
  }
  return upgradeFound;
}

export async function updatedImportMap(logs = true) {
  const [importMap, importMapPath] = await getImportMap(Deno.cwd());
  const upgradeFound = await upgradeDeps(importMap, logs);
  if (!upgradeFound) {
    return undefined;
  }
  return [importMap, importMapPath] as [ImportMap, string];
}

export async function upgradeDeps(importMap: ImportMap, logs: boolean) {
  let upgradeFound = await upgradeImportMapDeps(importMap, logs);
  const { "deco/": _, ...imports } = denoJSON.imports;
  for (const [importKey, importValue] of Object.entries(imports)) {
    if (!(importKey in importMap.imports)) {
      importMap.imports[importKey] = importValue;
      upgradeFound = true;
    }
  }
  return upgradeFound;
}

const updateStd = (newVer: string, code: string): string =>
  code.replace(
    /(https:\/\/[^\/]+\/(?:[^\/]+\/)?deco-sites\/std)@[^\/]+/,
    (_match, prefix) => `${prefix}@${newVer}`,
  );

const latestStdVersion = async () => {
  const info = await pkgInfo(`https://denopkg.com/deco-sites/std@1.25.0/`);
  if (!info) {
    return undefined;
  }
  return info?.versions?.latest;
};

const FRESH_CONFIG = "fresh.config.ts";

const updgradeStd = async () => {
  const freshConfigFile = await Deno.readTextFile(
    join(Deno.cwd(), FRESH_CONFIG),
  ).catch((_err) => null);
  if (typeof freshConfigFile === "string") {
    const newVer = await latestStdVersion().catch((_err) => null);
    if (!newVer) {
      return;
    }
    const updatedFreshConfigFile = updateStd(newVer, freshConfigFile);
    if (updatedFreshConfigFile !== freshConfigFile) {
      await Deno.writeTextFile(
        join(Deno.cwd(), FRESH_CONFIG),
        updatedFreshConfigFile,
      );
    }
  }
};
export async function update(checkStdUpdates = false) {
  const updates = await updatedImportMap();
  if (checkStdUpdates) {
    await updgradeStd();
  }
  if (!updates) {
    return;
  }
  const [importMap, importMapPath] = updates;
  await Deno.writeTextFile(
    importMapPath,
    `${JSON.stringify(importMap, null, 2)}\n`,
  );
  console.info("Upgraded successfully");
}
