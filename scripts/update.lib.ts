import { parse } from "@std/flags";
import * as colors from "@std/fmt/colors";
import { exists } from "@std/fs/exists";
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
const denoJSONFileNames = ["deno.json", "deno.jsonc"];
const getDenoJSONPath = async (cwd = Deno.cwd()) => {
  for (const importFileName of denoJSONFileNames) {
    const importMapPath = join(cwd, importFileName);
    if (await exists(importMapPath, { isFile: true })) {
      return importMapPath;
    }
  }
  return undefined;
};
async function* getImportMaps(
  dir: string,
): AsyncIterableIterator<[ImportMap, string]> {
  const denoJSONPath = await getDenoJSONPath(dir);
  if (!denoJSONPath) {
    throw new Error(`could not find deno.json definition in ${dir}`);
  }
  const denoJSON = await Deno.readTextFile(denoJSONPath).then(JSON.parse);
  // inlined import_map inside deno.json
  if (denoJSON.imports) {
    yield [denoJSON, denoJSONPath];
  } else {
    const importMapFile = denoJSON?.importMap ?? "./import_map.json";
    const importMapPath = join(dir, importMapFile.replace("./", ""));
    if (await (exists(importMapPath))) {
      yield [
        await Deno.readTextFile(importMapPath).then(JSON.parse).catch(() => ({
          imports: {},
        })),
        importMapPath,
      ];
    }
  }

  if (Array.isArray(denoJSON.workspace)) {
    for (const workspace of denoJSON.workspace as string[]) {
      yield* getImportMaps(join(dir, workspace));
    }
  }
}

async function upgradeImportMapDeps(
  importMap: ImportMap,
  logs = true,
  deps = PACKAGES_TO_CHECK,
  logger = console.info,
) {
  let upgradeFound = false;
  logs && logger("looking up latest versions");

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
          logs && logger(
            colors.yellow(
              `skipping ${pkg} ${currentVersion} -> ${latestVersion}. Use --force to upgrade.`,
            ),
          );
          return;
        }

        if (currentVersion !== latestVersion) {
          logs && logger(
            `upgrading ${pkg} ${currentVersion} -> ${latestVersion}.`,
          );

          upgradeFound = true;
          importMap.imports[pkg] = url.at(latestVersion).url;
        }
      }),
  );

  if (!importMap.imports?.["deco/"] && importMap.imports?.["$live/"]) {
    logs && logger("add deco/ alias");
    importMap.imports["deco/"] = importMap.imports["$live/"];
  }

  for (const [pkg, minVer] of Object.entries(requiredMinVersion)) {
    if (importMap.imports[pkg]) {
      const url = lookup(importMap.imports[pkg], REGISTRIES);
      const currentVersion = url?.version();
      logger({ currentVersion });
      if (
        !currentVersion ||
        semver.lessThan(semver.parse(currentVersion), semver.parse(minVer))
      ) {
        logs && logger(
          `upgrading ${pkg} ${currentVersion} -> ${minVer}.`,
        );

        upgradeFound = true;
        importMap.imports[pkg] = url?.at(minVer).url ?? importMap.imports[pkg];
      }
    }
  }

  if (!upgradeFound) {
    logs &&
      logger(
        "dependencies are on the most recent releases of deco!",
      );
  }
  return upgradeFound;
}

export async function* updatedImportMap(
  logs = true,
  cwd = Deno.cwd(),
): AsyncIterableIterator<[ImportMap, string]> {
  for await (const [importMap, importMapPath] of getImportMaps(cwd)) {
    const logger = (...msg: unknown[]) =>
      console.info(
        colors.gray(`${importMapPath.replaceAll(Deno.cwd(), ".")}:`),
        ...msg,
      );
    const upgradeFound = await upgradeDeps(
      importMap,
      logs,
      PACKAGES_TO_CHECK,
      logger,
    );
    if (upgradeFound) {
      yield [importMap, importMapPath];
      logger(colors.green(`upgraded successfully`));
    }
  }
}

export async function upgradeDeps(
  importMap: ImportMap,
  logs: boolean,
  deps: RegExp = PACKAGES_TO_CHECK,
  logger: typeof console["info"] = console.info,
) {
  let upgradeFound = await upgradeImportMapDeps(importMap, logs, deps, logger);
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

const updgradeStd = async (cwd = Deno.cwd()) => {
  const freshConfigFile = await Deno.readTextFile(
    join(cwd, FRESH_CONFIG),
  ).catch((_err) => null);
  if (typeof freshConfigFile === "string") {
    const newVer = await latestStdVersion().catch((_err) => null);
    if (!newVer) {
      return;
    }
    const updatedFreshConfigFile = updateStd(newVer, freshConfigFile);
    if (updatedFreshConfigFile !== freshConfigFile) {
      await Deno.writeTextFile(
        join(cwd, FRESH_CONFIG),
        updatedFreshConfigFile,
      );
    }
  }
};
export async function update(checkStdUpdates = false, cwd = Deno.cwd()) {
  for await (const [importMap, importMapPath] of updatedImportMap(true, cwd)) {
    await Deno.writeTextFile(
      importMapPath,
      `${JSON.stringify(importMap, null, 2)}\n`,
    );
  }
  if (checkStdUpdates) {
    await updgradeStd(cwd);
  }
}
