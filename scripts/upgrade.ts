import {
  brightGreen,
  brightRed,
  brightYellow,
  gray,
} from "https://deno.land/std@0.190.0/fmt/colors.ts";
import { ensureDir } from "https://deno.land/std@0.190.0/fs/ensure_dir.ts";
import { walk } from "https://deno.land/std@0.190.0/fs/walk.ts";
import { dirname, join } from "https://deno.land/std@0.190.0/path/mod.ts";

import $ from "https://deno.land/x/dax@0.28.0/mod.ts";
import { diffLines } from "npm:diff@5.1.0";
import deno from "../deno.json" assert { type: "json" };
import meta from "../meta.json" assert { type: "json" };
import { format } from "../utils/formatter.ts";

const withSlashAtEnd = (str: string | undefined) =>
  str?.endsWith("/") ? str : `${str}/`;

const withoutSlashAtEnd = (str: string | undefined) =>
  str?.endsWith("/") ? str.substring(0, str.length - 1) : str;

const namespaceFromGit = async (): Promise<string | undefined> => {
  const lns = await $`git config --get remote.origin.url`.lines();
  if (lns.length < 1) {
    return undefined;
  }
  const fetchUrlLine = lns[0];
  if (fetchUrlLine.startsWith("http")) { // http clone
    const fetchUrl = new URL(fetchUrlLine);
    return fetchUrl.pathname.substring(1).replace(".git", "").trimEnd(); // remove .git
  }
  if (fetchUrlLine.startsWith("git")) {
    const [_ignoreGitUrl, nsAndGit] = fetchUrlLine.split(":");
    const [namespace] = nsAndGit.split(".");
    return namespace.trimEnd();
  }
  return fetchUrlLine.replace(":", "/").trimEnd();
};
const ns = await namespaceFromGit().then(withSlashAtEnd);

const runtimeTS = `
import { withManifest } from "$live/clients/withManifest.ts";
import type { Manifest } from "./live.gen.ts";

export const Runtime = withManifest<Manifest>();
`;

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
            [ns]: "./",
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

const createRuntimeTS = async () => {
  const runtimeTsPath = join(Deno.cwd(), "runtime.ts");
  let runtimeTsContent = "";

  if ((await exists(runtimeTsPath))) {
    runtimeTsContent = await Deno.readTextFile(runtimeTsPath);
  }

  return {
    from: {
      path: runtimeTsPath,
      content: runtimeTsContent,
    },
    to: {
      path: runtimeTsPath,
      content: runtimeTS,
    },
  };
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
      namespace: withoutSlashAtEnd(ns),
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
    const [
      importMapPatch,
      siteJson,
      runtimeTs,
      devTsImports,
      mainTsLiveEntrypoint,
    ] = await Promise
      .all([
        updateImportMap(
          meta.version,
          "1.0.0",
        ),
        createSiteJson(),
        createRuntimeTS(),
        updateDevTsImports(),
        addMainTsLiveEntrypoint(),
      ]);
    return [
      ...removeRoutesAndFreshGenTs(),
      importMapPatch,
      siteJson,
      runtimeTs,
      devTsImports,
      mainTsLiveEntrypoint,
    ];
  },
};

const createSiteTs = async (): Promise<Patch> => {
  const siteTs = join(Deno.cwd(), "apps", "site.ts");
  return {
    from: {
      path: siteTs,
      content: "",
    },
    to: {
      path: siteTs,
      content: await format(`
import { AppContext as AC, App } from "$live/mod.ts";
import std, { Props } from "apps/compat/std/mod.ts";

import manifest, { Manifest } from "../manifest.gen.ts";

type StdApp = ReturnType<typeof std>;
export default function Site(
  state: Props,
): App<Manifest, Props, [
  StdApp,
]> {
  return {
    state,
    manifest,
    dependencies: [
      std(state),
    ],
  };
}

export type Storefront = ReturnType<typeof Site>;
export type AppContext = AC<Storefront>;
export { onBeforeResolveProps } from "apps/compat/$live/mod.ts";
`),
    },
  };
};

const overrideDevTs = async (): Promise<Patch> => {
  const devTs = join(Deno.cwd(), "dev.ts");
  const currentContent = await Deno.readTextFile(devTs);
  return {
    from: {
      path: devTs,
      content: currentContent,
    },
    to: {
      path: devTs,
      content: await format(`
// #!/usr/bin/env -S deno run -A --watch=static/
import dev from "$fresh/dev.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

await dev(import.meta.url, "./main.ts");
`),
    },
  };
};
const overrideDenoJson = async (): Promise<Patch> => {
  const denoJson = join(Deno.cwd(), "deno.json");
  const siteJson = join(Deno.cwd(), "site.json");
  const { namespace }: { namespace: string } = JSON.parse(
    await Deno.readTextFile(siteJson),
  );

  return {
    from: {
      path: denoJson,
      content: await Deno.readTextFile(denoJson),
    },
    to: {
      path: denoJson,
      content: JSON.stringify(
        {
          "tasks": {
            "start": `deno task bundle && DECO_SITE_NAME=${
              namespace.split("/")[1]
            } deno run -A --unstable --watch=static/sw.js,tailwind.css,sections/,functions/,loaders/,actions/,workflows/,accounts/ dev.ts`,
            "gen": "deno run -A dev.ts --gen-only",
            "component": "deno eval 'import \"$live/scripts/component.ts\"'",
            "release": "deno eval 'import \"$live/scripts/release.ts\"'",
            "update": "deno eval 'import \"$live/scripts/update.ts\"'",
            "check": "deno fmt && deno lint && deno check dev.ts main.ts",
            "install": "deno eval 'import \"$live/scripts/apps/install.ts\"'",
            "uninstall":
              "deno eval 'import \"$live/scripts/apps/uninstall.ts\"'",
            "bundle":
              `deno eval 'import \"$live/scripts/apps/bundle.ts\"' ${namespace}`,
          },
          "githooks": {
            "pre-commit": "check",
          },
          "exclude": ["node_modules", "static/", "README.md"],
          "nodeModulesDir": true,
          "importMap": "./import_map.json",
          "compilerOptions": {
            "jsx": "react-jsx",
            "jsxImportSource": "preact",
          },
        },
        null,
        2,
      ),
    },
  };
};
const addAppsImportMap = async (): Promise<Patch> => {
  const importMap = join(Deno.cwd(), "import_map.json");
  const currentContent = await Deno.readTextFile(importMap);

  const parsed = JSON.parse(currentContent);
  return {
    from: {
      path: importMap,
      content: currentContent,
    },
    to: {
      path: importMap,
      content: JSON.stringify(
        {
          ...parsed,
          imports: {
            ...parsed.imports,
            ["deco-sites/std/"]: "https://denopkg.com/deco-sites/std@1.21.6/",
            ["$live/"]: "https://denopkg.com/deco-cx/deco@1.33.3/",
            ["apps/"]: "https://denopkg.com/deco-cx/apps@0.2.11/",
          },
        },
        null,
        2,
      ),
    },
  };
};
const changeMainTs = async (): Promise<Patch> => {
  const mainTs = join(Deno.cwd(), "main.ts");
  const currentContent = await Deno.readTextFile(mainTs);

  return {
    from: {
      path: mainTs,
      content: currentContent,
    },
    to: {
      path: mainTs,
      content: await format(`
/// <reference no-default-lib="true"/>
/// <reference lib="dom" />
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />

import { start } from "$fresh/server.ts";
import plugins from "deco-sites/std/plugins/mod.ts";
import partytownPlugin from "partytown/mod.ts";
import manifest from "./fresh.gen.ts";
import decoManifest from "./manifest.gen.ts";

await start(manifest, {
  plugins: [
    ...plugins(
      {
        manifest: decoManifest,
      },
    ),
    partytownPlugin(),
  ],
});
`),
    },
  };
};
const changeRuntimeTs = async (): Promise<Patch> => {
  const runtimeTs = join(Deno.cwd(), "runtime.ts");
  const currentContent = await Deno.readTextFile(runtimeTs);
  return {
    from: {
      path: runtimeTs,
      content: currentContent,
    },
    to: {
      path: runtimeTs,
      content: await format(`
import { forApp } from "$live/clients/withManifest.ts";
import type { Storefront } from "./apps/site.ts";

export const Runtime = forApp<Storefront>();
`),
    },
  };
};

const deleteSiteJson = (): Delete => {
  return {
    path: join(Deno.cwd(), "site.json"),
  };
};
const deleteLiveGenTs = (): Delete => {
  return {
    path: join(Deno.cwd(), "live.gen.ts"),
  };
};

const apps: UpgradeOption = {
  isEligible: async () => (await exists(join(Deno.cwd(), "site.json"))),
  apply: async () => {
    const replaceTypingsImport: Promise<Patch | Delete>[] = [
      createSiteTs(),
      overrideDenoJson(),
      overrideDevTs(),
      addAppsImportMap(),
      changeMainTs(),
      changeRuntimeTs(),
      Promise.resolve(deleteSiteJson()),
      Promise.resolve(deleteLiveGenTs()),
    ];
    const checks: Promise<void>[] = [];
    for await (const entry of walk(Deno.cwd(), { exts: [".ts", ".tsx"] })) {
      checks.push(
        Deno.readTextFile(entry.path).then((content) => {
          if (content.includes("deco-sites/std/commerce/types.ts")) {
            replaceTypingsImport.push(Promise.resolve({
              from: {
                path: entry.path,
                content,
              },
              to: {
                path: entry.path,
                content: content.replaceAll(
                  "deco-sites/std/commerce/types.ts",
                  "apps/commerce/types.ts",
                ),
              },
            }));
          }
        }),
      );
    }
    await Promise.all(checks);
    return await Promise.all(replaceTypingsImport);
  },
};

const upgradeVersions: UpgradeOption[] = [v1, apps];

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
    await ensureDir(dirname(p.to.path));
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
        }
      }
      const shouldProceed = confirm("Do you want to proceed?");
      if (shouldProceed) {
        await Promise.all(patches.map(applyPatch));
        const denoTaskStart = new Deno.Command(Deno.execPath(), {
          args: ["task", "start"],
          stdout: "inherit",
        });
        const childProcess = denoTaskStart.spawn();
        await childProcess.status;
        childProcess.unref();
      }
    } else {
      console.log("everything is up to date!");
    }
  }
}
