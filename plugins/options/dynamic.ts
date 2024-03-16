import { updateLoadCache } from "deco/engine/schema/parser.ts";
import { build, initialize } from "https://deno.land/x/esbuild@v0.20.2/wasm.js";
import { debounce } from "std/async/debounce.ts";
import { dirname, join, toFileUrl } from "std/path/mod.ts";
import { BlockKey } from "../../blocks/app.ts";
import { buildImportMap } from "../../blocks/utils.tsx";
import { randomSiteName } from "../../engine/manifest/utils.ts";
import { fromJSON } from "../../engine/releases/fetcher.ts";
import { AppManifest } from "../../mod.ts";
import { defaultFs, FS, mount } from "../../scripts/mount.ts";
import { InitOptions, OptionsProvider } from "../deco.ts";

let initializePromise: Promise<void> | null = null;

const decofilePathFor = (site: string) => `/.deco/${site}.json`;
export const contentToDataUri = (
  modData: string,
  mimeType = "text/tsx",
) => `data:${mimeType};charset=utf-8;${modData}`;

async function bundle(
  fs: FS,
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
              ? join("/", args.path)
              : join("/", dirname(args.importer), args.path);
            return {
              path: realPath,
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

const underlyingFs = defaultFs();
const inMemoryFS: FS = {};
const rebuildInner = async (onEnd?: (m: AppManifest) => void) => {
  const contents = await bundle(inMemoryFS);
  const module = await import(
    `data:text/tsx,${encodeURIComponent(contents)}#manifest.gen.ts`
  );
  onEnd?.(module.default);
};

let queue = Promise.resolve();
const rebuild = debounce((onEnd?: (m: AppManifest) => void) => {
  queue = queue.catch((_err) => null).then(() =>
    rebuildInner(onEnd).catch((_err) => {})
  );
  return queue;
}, 500);

const isCodeFile = (path: string) =>
  path.endsWith(".tsx") || path.endsWith(".ts");

let localhostSite: string;
const _siteNameOf = (req: Request) => {
  const url = new URL(req.url);
  const hostname = url.searchParams.get("__host") ?? url.hostname; // format => {site}.deco.site
  let siteName: undefined | string;
  if (hostname === "localhost") {
    siteName = localhostSite ??= randomSiteName();
  } else {
    siteName = hostname.split(".")?.[0] ?? randomSiteName();
  }
  return siteName;
};

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

let prev: Disposable | null = null;

export const dynamicOptions = <
  TManifest extends AppManifest = AppManifest,
>(initialManifest: TManifest): OptionsProvider<TManifest> => {
  const decofilePath = decofilePathFor("storefront-vtex");
  const isDecofilePath = (path: string) => decofilePath === path;
  const { promise, resolve } = Promise.withResolvers<
    InitOptions<TManifest>
  >();
  const release = fromJSON({});
  const { promise: manifestPromise, resolve: manifestResolve } = Promise
    .withResolvers<TManifest>();

  manifestPromise.then((manifest) => {
    resolve({
      manifest: mergeManifests(initialManifest, manifest) as TManifest,
      release,
    });
  });

  const updateRelease = () => {
    const decofile = inMemoryFS[decofilePath]?.content;
    decofile && release?.set?.(JSON.parse(decofile));
  };
  const updateManifest = (m: AppManifest) => {
    manifestResolve(m as TManifest);
    promise.then((opts) => {
      opts.manifest = mergeManifests(opts.manifest, m) as TManifest;
      opts.release?.notify?.();
      opts.importMap = buildImportMap(opts.manifest);
    });
  };
  prev?.[Symbol.dispose]();
  queue = Promise.resolve();
  prev = mount({
    fs: {
      rm: async (path) => {
        delete inMemoryFS[path];
        await underlyingFs.rm(path);
        isCodeFile(path) && rebuild(updateManifest);
        isDecofilePath(path) && updateRelease();
      },
      write: async (path, content) => {
        inMemoryFS[path] = { content };
        await underlyingFs.write(path, content);
        isCodeFile(path) &&
          updateLoadCache(toFileUrl(join(Deno.cwd(), path)).href, content);
        isCodeFile(path) && rebuild(updateManifest);
        isDecofilePath(path) && updateRelease();
      },
    },
  });
  return (_req) => {
    return promise;
  };
};
