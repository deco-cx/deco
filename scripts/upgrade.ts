import {
  brightGreen,
  brightRed,
  brightYellow,
  gray,
} from "https://deno.land/std@0.204.0/fmt/colors.ts";
import {
  ensureFile,
  exists,
  walk,
} from "https://deno.land/std@0.204.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.204.0/path/mod.ts";
import * as semver from "https://deno.land/x/semver@v1.4.1/mod.ts";
import {
  lookup,
  REGISTRIES,
} from "https://denopkg.com/hayd/deno-udd@0.8.2/registry.ts";
import * as diff from "https://esm.sh/diff@5.1.0";
import { format } from "../utils/formatter.ts";
import { exec } from "./utils.ts";
// deno-lint-ignore verbatim-module-syntax
import denoJSON from "../deno.json" with { type: "json" };

type DenoJSON = typeof denoJSON;

const getLatestVersion = async (locator: string) => {
  const versions = await lookup(locator, REGISTRIES)?.all();
  const version = versions?.at(0);

  if (version) {
    const [_, ...tail] = locator.split("@").reverse();

    return `${tail.reverse().join("@")}@${version}`;
  }

  return locator;
};

const DECO_SITES_STD = getLatestVersion(
  "https://denopkg.com/deco-sites/std@master",
);
const DECO_CX_DECO = getLatestVersion(
  "https://denopkg.com/deco-cx/deco@master",
);
const DECO_CX_APPS = getLatestVersion(
  "https://denopkg.com/deco-cx/apps@master",
);

const withSlashAtEnd = (str: string | undefined) =>
  str?.endsWith("/") ? str : `${str}/`;

const withoutSlashAtEnd = (str: string | undefined) =>
  str?.endsWith("/") ? str.substring(0, str.length - 1) : str;

const namespaceFromGit = async (): Promise<string | undefined> => {
  const lns = (await exec(`git config --get remote.origin.url`)).stdout.split(
    "\n",
  );
  if (lns.length < 1) {
    return undefined;
  }
  const fetchUrlLine = lns[0];
  if (fetchUrlLine.startsWith("http")) {
    // http clone
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

interface UpgradeOption {
  name: string;
  description?: string;
  isEligible: () => Promise<boolean>;
  apply(): Promise<FileMod[]>;
}

// v1 migration code
interface Patch {
  from: string;
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

const v1: UpgradeOption = {
  name: "v1",
  description: "upgrades to deco@v1",
  isEligible: async () =>
    !(await exists(join(Deno.cwd(), "live.gen.ts"))) &&
    !(await exists(join(Deno.cwd(), "manifest.gen.ts"))),
  apply: async () => {
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
        from: devTs,
        to: {
          path: devTs,
          content: updateFreshGen,
        },
      };
    };
    const readImportMap = async () => {
      const [importmapPath, denojsonPath] = [
        "import_map.json",
        "deno.json",
      ].map((p) => join(Deno.cwd(), p));

      const [importmap, denojson] = await Promise.all([
        Deno.readTextFile(importmapPath).then(JSON.parse).catch(() => null),
        Deno.readTextFile(denojsonPath).then(JSON.parse).catch(() => null),
      ]);

      return importmap
        ? {
          content: importmap,
          path: importmapPath,
        }
        : {
          content: denojson,
          path: denojsonPath,
        };
    };
    const updateImportMap = async (): Promise<Patch> => {
      const { content, path } = await readImportMap();

      if (!content?.imports) {
        throw new UpgradeError(
          `Could not find "imports" on either import_map.json or deno.json files`,
        );
      }

      return {
        from: path,
        to: {
          path: path,
          content: JSON.stringify(
            {
              ...content,
              imports: {
                ...content.imports,
                [ns]: "./",
                "$live/": `${await DECO_CX_DECO}/`,
                "deco-sites/std/": `${await DECO_SITES_STD}/`,
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
    const createRuntimeTS = () => {
      const runtimeTsPath = join(Deno.cwd(), "runtime.ts");

      return Promise.resolve({
        from: runtimeTsPath,
        to: {
          path: runtimeTsPath,
          content: runtimeTS,
        },
      });
    };
    const createSiteJson = async () => {
      const siteFromMiddleware = await siteId();
      if (!siteFromMiddleware) {
        console.warn("could not extract siteId from middleware.ts");
      }
      const siteJSONPath = join(Deno.cwd(), "site.json");
      const finalContent = JSON.stringify(
        {
          siteId: siteFromMiddleware,
          namespace: withoutSlashAtEnd(ns),
        },
        null,
        2,
      );

      return {
        from: siteJSONPath,
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
        from: mainTs,
        to: {
          path: mainTs,
          content: mainTsContent
            .replace(
              `import manifest from "./fresh.gen.ts";\n`,
              `import manifest from "./live.gen.ts";\nimport { $live } from "$live/mod.ts";\nimport site from "./site.json" assert { type: "json" };\n`,
            )
            .replace(
              "await start(manifest",
              "await start($live(manifest, site)",
            ),
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

    const [
      importMapPatch,
      siteJson,
      runtimeTs,
      devTsImports,
      mainTsLiveEntrypoint,
    ] = await Promise.all([
      updateImportMap(),
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

const apps: UpgradeOption = {
  name: "Apps",
  description: "enables apps for extending your website",
  isEligible: async () => await exists(join(Deno.cwd(), "site.json")),
  apply: async () => {
    const createSiteTs = async (): Promise<Patch> => {
      const siteTs = join(Deno.cwd(), "apps", "site.ts");
      return {
        from: siteTs,
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
    const createDecohubTs = async (): Promise<Patch> => {
      const decohub = join(Deno.cwd(), "apps", "decohub.ts");
      return {
        from: decohub,
        to: {
          path: decohub,
          content: await format(
            `export { default, Preview } from "apps/decohub/mod.ts";`,
          ),
        },
      };
    };
    const createSWJs = async (): Promise<Patch> => {
      const swJs = join(Deno.cwd(), "static", "sw.js");
      return {
        from: swJs,
        to: {
          path: swJs,
          content: await format(`
            importScripts(
              'https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js'
            );
            
            workbox.setConfig({ debug: false });
            workbox.routing.setDefaultHandler(new workbox.strategies.NetworkOnly());
            workbox.recipes.offlineFallback({ pageFallback: '/offline' });`),
        },
      };
    };
    const overrideDevTs = async (): Promise<Patch> => {
      const devTs = join(Deno.cwd(), "dev.ts");

      return {
        from: devTs,
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

      const json = await Deno.readTextFile(denoJson).then(JSON.parse).catch(
        () => ({}),
      );

      return {
        from: denoJson,
        to: {
          path: denoJson,
          content: JSON.stringify(
            {
              ...json,
              imports: {
                ...json?.imports,
                "deco/": `${await DECO_CX_DECO}/`,
                "apps/": `${await DECO_CX_APPS}/`,
              },
              tasks: {
                ...json?.tasks,
                start:
                  `deno task bundle && deno run -A --unstable --watch=static/sw.js,tailwind.css,sections/,functions/,loaders/,actions/,workflows/,accounts/ dev.ts`,
                gen: "deno run -A dev.ts --gen-only",
                component: "deno eval 'import \"deco/scripts/component.ts\"'",
                release: "deno eval 'import \"deco/scripts/release.ts\"'",
                update: "deno eval 'import \"deco/scripts/update.ts\"'",
                check: "deno fmt && deno lint && deno check dev.ts main.ts",
                install: "deno eval 'import \"deco/scripts/apps/install.ts\"'",
                uninstall:
                  "deno eval 'import \"deco/scripts/apps/uninstall.ts\"'",
                bundle:
                  `deno eval 'import \"deco/scripts/apps/bundle.ts\"' ${namespace}`,
              },
              githooks: {
                ...json?.githooks,
                "pre-commit": "check",
              },
              exclude: ["node_modules", "static/", "README.md"],
              nodeModulesDir: true,
              compilerOptions: {
                jsx: "react-jsx",
                jsxImportSource: "preact",
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

      return {
        from: mainTs,
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

      return {
        from: runtimeTs,
        to: {
          path: runtimeTs,
          content: await format(
            `import { forApp } from "$live/clients/withManifest.ts";
    import type { Storefront } from "./apps/site.ts";
    
    export const Runtime = forApp<Storefront>();
    `,
          ),
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

    const patches: Promise<Patch | Delete>[] = [
      createSiteTs(),
      createDecohubTs(),
      createSWJs(),
      overrideDenoJson(),
      overrideDevTs(),
      changeMainTs(),
      changeRuntimeTs(),
      Promise.resolve(deleteSiteJson()),
      Promise.resolve(deleteLiveGenTs()),
    ];
    const checks: Promise<void>[] = [];
    for await (const entry of walk(Deno.cwd(), { exts: [".ts", ".tsx"] })) {
      checks.push(
        Deno.readTextFile(entry.path).then((content) => {
          if (
            content.includes("deco-sites/std/commerce/types.ts") ||
            content.includes("deco-sites/std/packs/vtex/hooks") ||
            content.includes("deco-sites/std/components/Image.tsx") ||
            content.includes("deco-sites/std/components/Picture.tsx") ||
            content.includes(`${ns}live.gen.ts`) ||
            content.includes(
              "deco-sites/std/commerce/utils/productToAnalyticsItem.ts",
            )
          ) {
            patches.push(
              Promise.resolve({
                from: entry.path,
                to: {
                  path: entry.path,
                  content: content
                    .replaceAll(
                      "deco-sites/std/commerce/types.ts",
                      "apps/commerce/types.ts",
                    )
                    .replaceAll(
                      "deco-sites/std/commerce/utils/productToAnalyticsItem.ts",
                      "apps/commerce/utils/productToAnalyticsItem.ts",
                    )
                    .replaceAll(
                      `${ns}live.gen.ts`,
                      `${ns}manifest.gen.ts`,
                    )
                    .replaceAll(
                      "deco-sites/std/packs/vtex/hooks",
                      "apps/vtex/hooks",
                    )
                    .replaceAll(
                      "deco-sites/std/components/Image.tsx",
                      "apps/website/components/Image.tsx",
                    )
                    .replaceAll(
                      "deco-sites/std/components/Image.tsx",
                      "apps/website/components/Image.tsx",
                    )
                    .replaceAll(
                      "deco-sites/std/components/Picture.tsx",
                      "apps/website/components/Picture.tsx",
                    ),
                },
              }),
            );
          }
        }),
      );
    }
    await Promise.all(checks);
    return await Promise.all(patches);
  },
};

const _aot: UpgradeOption = {
  name: "ahead-of-time",
  description:
    "enables ahead of time builds for stable assets and better performance: https://fresh.deno.dev/docs/concepts/ahead-of-time-builds",
  isEligible: async () =>
    !(await exists(join(Deno.cwd(), ".github/workflows/deco-deploy.yaml"))),
  apply: () => {
    const createDecoDeploy = () => ({
      from: join(Deno.cwd(), ".github/workflows/deco-deploy.yaml"),
      to: {
        path: join(Deno.cwd(), ".github/workflows/deco-deploy.yaml"),
        content: `name: Deploy
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest

    permissions:
      id-token: write # Needed for auth with Deno Deploy
      contents: read # Needed to clone the repository

    steps:
      - name: Clone repository
        uses: actions/checkout@v3

      - name: Deco Deploy
        uses: deco-cx/deploy@v0`,
      },
    });
    const createFreshConfigTs = async () => {
      const maints = await Deno.readTextFile(
        join(Deno.cwd(), "main.ts"),
      )
        .catch(() => "")
        .then((src) =>
          src.replace(
            "await start(manifest,",
            `import { defineConfig } from "$fresh/server.ts"\nexport default defineConfig(`,
          )
        )
        .then((src) =>
          src.replace(
            "plugins: [",
            'build: { target: ["chrome99", "firefox99", "safari12"] },\nplugins: [',
          )
        )
        .then((src) =>
          src.replace(`import { start } from "$fresh/server.ts";`, "")
        )
        .then((src) =>
          src.replace(`import manifest from "./fresh.gen.ts";`, "")
        );

      return {
        from: join(Deno.cwd(), "fresh.config.ts"),
        to: {
          path: join(Deno.cwd(), "fresh.config.ts"),
          content: await format(maints),
        },
      };
    };
    const createMainTS = async () => ({
      from: join(Deno.cwd(), "main.ts"),
      to: {
        path: join(Deno.cwd(), "main.ts"),
        content: await format(`
        import { start } from "$fresh/server.ts";
        import config from "./fresh.config.ts";
        import manifest from "./fresh.gen.ts";
        
        await start(manifest, config);`),
      },
    });
    const createDevTS = async () => ({
      from: join(Deno.cwd(), "dev.ts"),
      to: {
        path: join(Deno.cwd(), "dev.ts"),
        content: await format(`
        import "https://deno.land/x/dotenv@v3.2.2/load.ts";
        
        import dev from "$fresh/dev.ts";
        import config from "./fresh.config.ts";
        
        // Generate manifest and boot server
        await dev(import.meta.url, "./main.ts", config);
        
        if (Deno.args.includes("build")) {
          Deno.exit(0);
        }`),
      },
    });
    const createDotEnv = () => ({
      from: join(Deno.cwd(), ".env"),
      to: {
        path: join(Deno.cwd(), ".env"),
        content: `DECO_SITE_NAME=${ns.split("/")[1]}
`,
      },
    });

    return Promise.all([
      createDecoDeploy(),
      createFreshConfigTs(),
      createMainTS(),
      createDevTS(),
      createDotEnv(),
    ]);
  },
};

const getDenoJson = (): Promise<[string, DenoJSON]> => {
  const paths = ["deno.json", "deno.jsonc"];
  return Promise.all(
    paths.map((path) =>
      Deno.readTextFile(join(Deno.cwd(), path)).then(JSON.parse).catch(() =>
        null
      )
    ),
  ).then((denoJSONs) => {
    const idx = denoJSONs.findIndex(Boolean);
    return [join(Deno.cwd(), paths[idx]), denoJSONs[idx]] as [string, DenoJSON];
  });
};
const _requiresMinDecoVer = (ver: string) => {
  return async () => {
    const [_denoJSONPath, denoJSON] = await getDenoJson();
    const decoVersion = denoJSON?.imports?.["deco/"];
    if (!decoVersion) {
      return true;
    }
    const url = lookup(decoVersion, REGISTRIES);
    const decoVer = url?.version?.();
    if (!decoVer) {
      return true;
    }

    return semver.lt(decoVer, ver);
  };
};
const environments: UpgradeOption = {
  name: "wm-environments",
  description: "enables environments for better development",
  isEligible: () => {
    return Promise.resolve(true);
  },
  apply: async () => {
    const gitIgnorePath = join(Deno.cwd(), ".gitignore");
    const initialGitIgnoreContent = await Deno.readTextFile(gitIgnorePath)
      .catch(() => {
        return "";
      });
    let gitignore = initialGitIgnoreContent;
    if (!gitignore.includes(".metadata/changeset.json")) {
      gitignore =
        `${gitignore}\n\n# Deco files\n\n_docker_deps.ts\n.metadata/changeset.json`;
    }
    const addNewTasks = async (): Promise<Patch> => {
      const [denoJSONPath, denoJSON] = await getDenoJson();
      const envExists = await exists(join(Deno.cwd(), ".env"), {
        isFile: true,
      });
      const envArg = envExists ? "--env" : "";
      const dev = `deno run -A ${envArg} --unstable --unstable-hmr dev.ts`;

      const start =
        `deno task bundle && deno run -A ${envArg} --unstable --config=deno.json $(deno eval 'console.log(import.meta.resolve("deco/hypervisor/main.ts"))') --build-cmd 'deno task build' -- deno task dev`;

      return {
        from: denoJSONPath,
        to: {
          path: denoJSONPath,
          content: JSON.stringify(
            {
              ...denoJSON,
              imports: {
                ...denoJSON.imports,
              },
              tasks: {
                ...denoJSON?.tasks,
                dev,
                start,
              },
            },
            null,
            2,
          ),
        },
      };
    };
    return [
      ...initialGitIgnoreContent !== gitignore
        ? [{
          from: gitIgnorePath,
          to: {
            path: gitIgnorePath,
            content: gitignore,
          },
        }]
        : [],
      await addNewTasks(),
    ];
  },
};

const UPGRADES: UpgradeOption[] = [v1, apps, environments];

const isDelete = (f: FileMod): f is Delete => {
  return (f as Delete).path !== undefined;
};
const applyPatch = async (p: FileMod): Promise<void> => {
  if (isDelete(p)) {
    await Deno.remove(p.path).catch(() => {});
  } else {
    if (p.from !== p.to.path) {
      await Deno.remove(p.from).catch(() => {});
    }
    await ensureFile(p.to.path);
    await Deno.writeTextFile(p.to.path, p.to.content);
  }
};

if (import.meta.main) {
  const yesToAll = Boolean(Deno.args.find((x) => x === "--y"));

  let ok = true;
  const enc = new TextEncoder();

  const denoRun = async (cmd: string) => {
    try {
      const process = new Deno.Command(Deno.execPath(), {
        args: ["run", "-Ar", ...cmd.split(" ")],
        stdout: "inherit",
      }).spawn();
      setTimeout(() => {
        try {
          process.kill();
        } catch (error) {
          console.error(error);
        }
      }, 60 * 1e3);
      const s = await process.status;
      if (s.code !== 0) {
        throw new Error(`Process finished with status code ${s.code}`);
      }

      return true;
    } catch (error) {
      console.error(`Failed while running ${cmd}\n`, error);

      return false;
    }
  };

  console.log(
    "Welcome to deco.cx upgrade tool. First we need to upgrade your dependencies",
  );
  ok = yesToAll || confirm("Do you want to proceed?");
  if (!ok) {
    console.log("See you later!");
    Deno.exit(0);
  }

  ok = await denoRun("https://fresh.deno.dev/update .");
  ok = ok && await denoRun("https://deco.cx/update");

  if (!ok) Deno.exit(1);

  console.log("Dependencies are up to date. Applying migration patches");

  for (const upgrade of UPGRADES) {
    const run = await upgrade.isEligible();

    if (!run) continue;

    const patches = await upgrade.apply();

    // Check if patches change the same file
    const knownPaths = new Set();
    for (const patch of patches) {
      const path = isDelete(patch) ? patch.path : patch.to.path;

      if (knownPaths.has(path)) {
        throw new Error(`Patch on file ${path} conflicts with previous patch`);
      }

      knownPaths.add(path);
    }

    for (const patch of patches) {
      if (isDelete(patch)) {
        console.log(`🚨 ${brightRed(patch.path)} will be deleted.`);

        continue;
      }

      const content = await Deno.readTextFile(patch.from).catch(() => "");

      const linesDiff = diff.diffLines(content, patch.to.content);

      if (linesDiff.length === 1 && patch.from === patch.to.path) {
        const change = linesDiff[0].added ? "(new file)" : "(no changes)";
        console.log(gray(`✅ ${patch.from} ${change}`));

        continue;
      }

      console.log(
        `⚠️  ${brightYellow(patch.from)} -> ${brightYellow(patch.to.path)}`,
      );

      if (yesToAll) continue;

      // Print line diffs
      for (const { added, removed, value } of linesDiff) {
        const color = added ? brightGreen : removed ? brightRed : gray;
        await Deno.stdout.write(enc.encode(color(value)));
      }
      await Deno.stdout.write(enc.encode("\n"));
    }

    console.log(`These changes ${upgrade.description}`);
    ok = yesToAll || confirm("Do you want to proceed?");
    if (!ok) continue;

    console.log(`Applying patch ${upgrade.name}`);
    for (const patch of patches) {
      await applyPatch(patch);
    }
  }

  console.log("everything is up to date! 🎉");
  Deno.exit(0);
}
