import {
  lookup,
  REGISTRIES,
} from "https://denopkg.com/hayd/deno-udd@0.8.2/registry.ts";
import { brightYellow } from "std/fmt/colors.ts";
import { join } from "std/path/mod.ts";
import { printDiff } from "../scripts/changelog.ts";

// map of `packageAlias` to `packageRepo`
const packagesThatShouldBeChecked: Record<string, string> = {
  "$live/": "deco-cx/live/",
  "deco-sites/std/": "deco-sites/std/",
};
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

/**
 * Used to storage update answers by the user
 */
const answerOf = (dir: string, pkg: string) => {
  const key = `live_update_answers_${dir}_${pkg}`;
  const answer = {
    set: (ver: string) => localStorage.setItem(key, ver),
    get: () => localStorage.getItem(key),
  };
  return {
    ...answer,
    shouldAsk: (ver: string) => {
      const should = answer.get() !== ver;
      should && answer.set(ver); // if answered so we should clean the current answer
      return should;
    },
  };
};
export const checkUpdates = async (_dir?: string) => {
  if (Deno.env.has(ANSWERED)) { // once per `deno task start`
    return;
  }
  const dir = _dir ?? Deno.cwd();
  const [importMap, importMapPath] = await getImportMap(dir ?? Deno.cwd());
  const updates: Record<string, string> = {};
  for (const pkg of Object.keys(packagesThatShouldBeChecked)) {
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
    const answers = answerOf(dir, pkg);
    const versions = await url.all();
    const currentVersion = url.version();
    const latestVersion = versions[0];

    const showUpdateNotice = () => {
      console.log(
        brightYellow(
          `update available for ${pkg} ${currentVersion} -> ${latestVersion}.`,
        ),
      );
      return false;
    };
    if (
      currentVersion !== latestVersion &&
      (answers.shouldAsk(latestVersion) || showUpdateNotice())
    ) {
      const latestUrl = url.at(latestVersion).url;
      const repo = packagesThatShouldBeChecked[pkg];
      if (repo) {
        console.log(); // breakline
        await printDiff(currentVersion, repo);
      }
      showUpdateNotice();
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
