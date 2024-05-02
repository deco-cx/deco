import { build, initialize } from "https://deno.land/x/esbuild@v0.20.2/wasm.js";
import { debounce } from "std/async/debounce.ts";
import * as colors from "std/fmt/colors.ts";
import { dirname, join, toFileUrl } from "std/path/mod.ts";
import { dirname as posixDirname, join as posixJoin } from "std/path/posix.ts";
import { BlockKey } from "../blocks/app.ts";
import { buildImportMap } from "../blocks/utils.tsx";
import { Context, DecoContext } from "../deco.ts";
import { fromJSON } from "../engine/releases/fetcher.ts";
import { DECOFILE_REL_PATH } from "../engine/releases/provider.ts";
import { updateLoadCache } from "../engine/schema/parser.ts";
import { assertAllowedAuthority } from "../engine/trustedAuthority.ts";
import { AppManifest, newContext } from "../mod.ts";
import { InitOptions } from "../plugins/deco.ts";
import { FileSystem, mount } from "../scripts/mount.ts";
import { stringToHexSha256 } from "../utils/encoding.ts";
import { fileSeparatorToSlash } from "../utils/filesystem.ts";
import { VFS } from "./fs/mod.ts";

let initializePromise: Promise<void> | null = null;

const DECOFILE_PATH = `/${fileSeparatorToSlash(DECOFILE_REL_PATH)}`;
export const contentToDataUri = (
  modData: string,
  mimeType = "text/tsx",
) => `data:${mimeType};charset=utf-8;${modData}`;

async function bundle(
  fs: FileSystem,
): Promise<string> {
  const manifest = fs["/manifest.gen.ts"]?.content;
  if (!manifest) {
    return "";
  }
  initializePromise ??= initialize({
    wasmURL: "https://deno.land/x/esbuild@v0.20.2/esbuild.wasm",
    worker: false,
  });
  await initializePromise;

  const { outputFiles } = await build({
    stdin: {
      contents: manifest,
      loader: "tsx",
    },
    platform: "browser",
    jsxImportSource: "preact",
    jsx: "automatic",
    format: "esm", // Set output format to ESM
    bundle: true,
    write: false,
    plugins: [
      {
        name: "env",
        setup(build) {
          build.onResolve({ filter: /^\.\.?.*$/ }, (args) => {
            const realPath = args.importer === "<stdin>"
              ? posixJoin("/", args.path)
              : posixJoin("/", posixDirname(args.importer), args.path);
            if (realPath.startsWith("/islands/")) {
              return {
                path: import.meta.resolve(
                  toFileUrl(
                    posixJoin(
                      Deno.cwd(),
                      posixDirname(args.importer),
                      args.path,
                    ),
                  ).href,
                ),
                external: true,
              };
            }

            return {
              path: realPath.startsWith(".") ? realPath.slice(1) : realPath,
              namespace: "code-inline",
            };
          }),
            build.onLoad(
              { filter: /^\//, namespace: "code-inline" },
              (args) => {
                const contents = fs[args.path]?.content ?? "";
                return {
                  loader: "tsx",
                  contents,
                };
              },
            ),
            build.onResolve({ filter: /.*/ }, (args) => {
              return {
                path: args.path,
                external: true,
              };
            });
        },
      },
    ],
  });

  return outputFiles[0].text;
}

const isCodeFile = (path: string) =>
  path.endsWith(".tsx") || path.endsWith(".ts");

const mergeManifests = (
  target: AppManifest,
  manifest: AppManifest,
): AppManifest => {
  const { baseUrl: _ignoreBaseUrl, name: _ignoreName, ...appManifest } =
    manifest;
  for (const [key, value] of Object.entries(appManifest)) {
    const manifestBlocks = { ...(target[key as BlockKey] ?? {}) };
    for (const [blockKey, blockFunc] of Object.entries(value)) {
      manifestBlocks[blockKey] = blockFunc;
    }
    // deno-lint-ignore no-explicit-any
    target[key as BlockKey] = manifestBlocks as any;
  }

  return target;
};

export const contextFromVolume = async <
  TManifest extends AppManifest = AppManifest,
>(vol: string, onUnmount?: () => void): Promise<DecoContext> => {
  const volUrl = new URL(vol);
  assertAllowedAuthority(volUrl);
  const currentContext = Context.active();
  const siteFromVolUrl = volUrl.searchParams.get("site");
  if (siteFromVolUrl !== currentContext.site) {
    throw new Error(`${siteFromVolUrl} does not match ${currentContext.site}`);
  }
  const shouldMountDecofileOnly = currentContext.platform === "deno_deploy" ||
    Deno.env.get("VFS_WATCH_DECOFILE_ONLY") === "true";
  if (shouldMountDecofileOnly) {
    volUrl.searchParams.set("path", "/.deco/**/*.json");
  }

  const { manifest: initialManifest } = await currentContext.runtime!;
  const baseDir = join(dirname(initialManifest.baseUrl), "/");
  const inMemoryFS: FileSystem = {};
  const fs = new VFS(inMemoryFS);
  let nextBuild = Promise.withResolvers<void>();
  nextBuild.resolve();
  const rebuild = debounce(async (onEnd?: (manifest: AppManifest) => void) => {
    nextBuild = Promise.withResolvers<void>();
    try {
      const start = performance.now();
      const contents = await bundle(inMemoryFS);
      console.log(
        `~[${colors.green("esbuild")}]: took ${
          (performance.now() - start).toFixed(0)
        }ms`,
      );
      const module = await import(
        `data:text/tsx,${encodeURIComponent(contents)}#manifest.gen.ts`
      );
      onEnd?.(module.default);
    } catch (err) {
      console.log("ignoring dynamic import error", err);
    } finally {
      nextBuild.resolve();
    }
    return undefined;
  }, 200);

  const isDecofilePath = (path: string) => DECOFILE_PATH === path;
  const init = Promise.withResolvers<
    InitOptions<TManifest>
  >();
  const release = fromJSON({});
  const manifestResolvers = Promise
    .withResolvers<TManifest>();

  manifestResolvers.promise.then((manifest) => {
    const mergedManifest = mergeManifests({
      name: initialManifest.name,
      baseUrl: initialManifest.baseUrl,
    }, manifest) as TManifest;
    init.resolve({
      manifest: mergedManifest,
      release,
      importMap: { imports: {} },
    });
  });

  const { promise: firstLoadPromise, resolve: firstLoadResolve } = Promise
    .withResolvers<void>();

  const updateRelease = async (revisionId?: string) => {
    const decofile = inMemoryFS[DECOFILE_PATH]?.content;
    const hash = revisionId ??
      (decofile ? await stringToHexSha256(decofile) : undefined);
    const awaiter = decofile
      ? release?.set?.(
        JSON.parse(decofile),
        hash,
      ) ??
        Promise.resolve()
      : Promise.resolve();
    decofile && firstLoadResolve();
    return awaiter;
  };
  const updateManifest = (m: AppManifest) => {
    manifestResolvers.resolve(m as TManifest);
    return init.promise.then(async (opts) => {
      opts.manifest = mergeManifests(opts.manifest, m) as TManifest;
      opts.importMap!.imports = buildImportMap(opts.manifest).imports;
      return await updateRelease(crypto.randomUUID());
    });
  };
  const fsWatcher = fs.watchFs("/", { recursive: true });
  (async () => {
    for await (const event of fsWatcher) {
      let hasCodeChange = false;
      let hasDecofileChange = false;
      for (const path of event.paths) {
        const pathIsCode = isCodeFile(path);
        hasCodeChange ||= pathIsCode;
        hasDecofileChange ||= isDecofilePath(path);
        const filePath = new URL(path.slice(1), baseDir).href;
        pathIsCode && inMemoryFS[path]?.content &&
          updateLoadCache(
            filePath,
            inMemoryFS[path]!.content!,
          );
      }
      if (hasCodeChange) {
        rebuild((m) => {
          if (!m) {
            return Promise.resolve();
          }
          return updateManifest(m);
        });
        await nextBuild.promise;
      } else if (hasDecofileChange) {
        updateRelease();
      }
    }
    onUnmount?.();
  })();
  const mountPoint = mount({
    vol: volUrl.href,
    fs,
  });
  mountPoint.onUnmount = () => {
    fsWatcher.close();
  };
  const currentDispose = release?.dispose;
  release.dispose = () => {
    currentDispose?.();
    mountPoint.unmount();
  };
  if (shouldMountDecofileOnly) {
    init.resolve({
      manifest: initialManifest as TManifest,
      release,
    });
  }
  return init.promise.then(async (opts) => {
    await firstLoadPromise;
    const ctx = await newContext(
      opts.manifest,
      opts.importMap,
      opts.release,
      undefined,
      currentContext.site,
    );
    if (!shouldMountDecofileOnly) {
      ctx.fs = fs;
    }
    ctx.namespace = currentContext.namespace;
    return ctx;
  });
};
