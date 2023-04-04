import {
  brightGreen,
  brightRed,
  brightYellow,
  gray,
} from "https://deno.land/std@0.170.0/fmt/colors.ts";
import { join } from "https://deno.land/std@0.170.0/path/mod.ts";
import { diffLines } from "https://esm.sh/diff@5.1.0";
import deno from "../deno.json" assert { type: "json" };
import meta from "../meta.json" assert { type: "json" };
import { namespaceFromImportMap } from "../utils/namespace.ts";

const exists = async (dir: string): Promise<boolean> => {
  try {
    await Deno.stat(dir);
    // successful, file or directory must exist
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // file or directory does not exist
      return false;
    } else {
      // unexpected error, maybe permissions, pass it along
      throw error;
    }
  }
};

interface UpgradeOption {
  version?: string; // if omitted, latest will be used.
  isEligible: () => Promise<boolean>;
  apply(): Promise<FileMod[]>;
}

// v1 migration code
interface Patch {
  from: {
    path: string;
    content: string;
  };
  to: {
    path: string;
    content: string;
  };
}
interface Delete {
  path: string;
}
type FileMod = Patch | Delete;
class UpgradeError extends Error {
  constructor(err: string) {
    super(err);
  }
}

const updateDevTsImports = async () => {
  const devTs = join(Deno.cwd(), "dev.ts");
  if (!(await exists(devTs))) {
    throw new UpgradeError(`${devTs} not found`);
  }
  const devTsContent = await Deno.readTextFile(devTs);
  const updateFreshGen = devTsContent.replaceAll(
    "fresh.gen.ts",
    "live.gen.ts",
  );
  return {
    from: {
      path: devTs,
      content: devTsContent,
    },
    to: {
      path: devTs,
      content: updateFreshGen,
    },
  };
};

const updateImportMap = async (
  liveVersion: string,
  stdVersion: string,
): Promise<Patch> => {
  const importMapFile = (deno.importMap ?? "./import_map.json").replace(
    "./",
    "",
  );

  const importMapPath = join(Deno.cwd(), importMapFile);
  if (!(await exists(importMapPath))) {
    throw new UpgradeError(
      `${importMapPath} is required to upgrade live dependency verson`,
    );
  }
  const importMapStr = await Deno.readTextFile(importMapPath);
  const { imports, ...rest }: { imports: Record<string, string> } = JSON.parse(
    importMapStr,
  );
  return {
    from: {
      path: importMapPath,
      content: importMapStr,
    },
    to: {
      path: importMapPath,
      content: JSON.stringify(
        {
          ...rest,
          imports: {
            ...imports,
            "$live/": `https://denopkg.com/deco-cx/live@${liveVersion}/`,
            "deco-sites/std/":
              `https://denopkg.com/deco-sites/std@${stdVersion}/`,
          },
        },
        null,
        2,
      ),
    },
  };
};

const siteId = async (): Promise<number | undefined> => {
  const middleware = join(Deno.cwd(), "routes", "_middleware.ts");
  if (!(await exists(middleware))) {
    return undefined;
  }
  const reg = /siteId: (?<siteId>\d+)/gm;
  const match = reg.exec(await Deno.readTextFile(middleware));
  if (!match?.groups) {
    return undefined;
  }
  return +match.groups["siteId"];
};

const createSiteJson = async () => {
  const siteFromMiddleware = await siteId();
  if (!siteFromMiddleware) {
    console.warn("could not extract siteId from middleware.ts");
  }
  const siteJSONPath = join(Deno.cwd(), "site.json");
  let siteJSONContent = "";
  if ((await exists(siteJSONPath))) {
    siteJSONContent = await Deno.readTextFile(siteJSONPath);
  }
  const finalContent = JSON.stringify(
    {
      siteId: siteFromMiddleware,
    },
    null,
    2,
  );

  return {
    from: {
      path: siteJSONPath,
      content: siteJSONContent,
    },
    to: {
      path: siteJSONPath,
      content: finalContent,
    },
  };
};

const addMainTsLiveEntrypoint = async () => {
  const mainTs = join(Deno.cwd(), "main.ts");
  if (!(await exists(mainTs))) {
    throw new UpgradeError(`${mainTs} not found`);
  }
  const mainTsContent = await Deno.readTextFile(mainTs);

  return {
    from: {
      path: mainTs,
      content: mainTsContent,
    },
    to: {
      path: mainTs,
      content: mainTsContent.replace(
        `import manifest from "./fresh.gen.ts";\n`,
        `import manifest from "./live.gen.ts";\nimport { $live } from "$live/mod.ts";\nimport site from "./site.json" assert { type: "json" };\n`,
      ).replace("await start(manifest", "await start($live(manifest, site)"),
    },
  };
};

const removeRoutesAndFreshGenTs = (): Delete[] => {
  return [
    ["routes", "[...catchall].tsx"],
    ["routes", "_middleware.ts"],
    ["routes", "index.tsx"],
    ["fresh.gen.ts"],
  ].map((file) => ({ path: join(Deno.cwd(), ...file) }));
};
const v1: UpgradeOption = {
  isEligible: async () => !(await exists(join(Deno.cwd(), "live.gen.ts"))),
  apply: async () => {
    const [importMapPatch, siteJson, devTsImports, mainTsLiveEntrypoint] =
      await Promise
        .all([
          updateImportMap(
            meta.version,
            "1.0.0-rc.8",
          ),
          createSiteJson(),
          updateDevTsImports(),
          addMainTsLiveEntrypoint(),
        ]);
    return [
      ...removeRoutesAndFreshGenTs(),
      importMapPatch,
      siteJson,
      devTsImports,
      mainTsLiveEntrypoint,
    ];
  },
};

const upgradeVersions: UpgradeOption[] = [v1];

const isDelete = (f: FileMod): f is Delete => {
  return (f as Delete).path !== undefined;
};
const applyPatch = async (p: FileMod): Promise<void> => {
  if (isDelete(p)) {
    if (await exists(p.path)) {
      await Deno.remove(p.path);
    }
  } else {
    if (p.from.path !== p.to.path) {
      await Deno.remove(p.from.path);
    }
    await Deno.writeTextFile(p.to.path, p.to.content);
  }
};

if (import.meta.main) {
  for (const version of upgradeVersions) {
    if (await version.isEligible()) {
      const patches = await version.apply();
      for (const patch of patches) {
        if (isDelete(patch)) {
          console.log(`🚨 ${brightRed(patch.path)} will be deleted.`);
        } else {
          console.log(
            `⚠️ ${brightYellow(patch.from.path)} -> ${
              brightYellow(patch.to.path)
            }`,
          );
          const liensDiff = diffLines(
            patch.from.content,
            patch.to.content,
          );
          const enc = new TextEncoder();
          const promises: Promise<unknown>[] = [];
          liensDiff.forEach((part) => {
            // green for additions, red for deletions
            // grey for common parts
            const color = part.added
              ? brightGreen
              : part.removed
              ? brightRed
              : gray;
            promises.push(Deno.stdout.write(enc.encode(color(part.value))));
          });
          await Promise.all(promises);
          console.log();
        }
      }
      const shouldProceed = confirm("Do you want to proceed?");
      if (shouldProceed) {
        await Promise.all(patches.map(applyPatch));
        await namespaceFromImportMap(Deno.cwd());
        const p = Deno.run({ cmd: ["deno", "task", "start"] });
        await p.status();
      }
    } else {
      console.log("everything is up to date!");
    }
  }
}
