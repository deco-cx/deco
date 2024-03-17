import { build, initialize } from "https://deno.land/x/esbuild@v0.20.2/wasm.js";
import { debounce } from "std/async/debounce.ts";
import { dirname, join, toFileUrl } from "std/path/mod.ts";
import { BlockKey } from "../blocks/app.ts";
import { buildImportMap } from "../blocks/utils.tsx";
import { Context, DecoContext } from "../deco.ts";
import { fromJSON } from "../engine/releases/fetcher.ts";
import { updateLoadCache } from "../engine/schema/parser.ts";
import { assertAllowedAuthority } from "../engine/trustedAuthority.ts";
import { AppManifest, newContext } from "../mod.ts";
import { InitOptions } from "../plugins/deco.ts";
import { FS, mount } from "../scripts/mount.ts";

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
>(vol: string): Promise<DecoContext> => {
  const volUrl = new URL(vol);
  assertAllowedAuthority(volUrl);
  const currentContext = Context.active();
  const siteFromVolUrl = volUrl.searchParams.get("site");
  if (siteFromVolUrl !== currentContext.site) {
    throw new Error(`${siteFromVolUrl} does not match ${currentContext.site}`);
  }
  const { manifest: initialManifest } = await currentContext.runtime!;
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

  const decofilePath = decofilePathFor(siteFromVolUrl);
  const isDecofilePath = (path: string) => decofilePath === path;
  const { promise, resolve } = Promise.withResolvers<
    InitOptions<TManifest>
  >();
  const release = fromJSON({});
  const { promise: manifestPromise, resolve: manifestResolve } = Promise
    .withResolvers<TManifest>();

  manifestPromise.then((manifest) => {
    resolve({
      manifest: mergeManifests({
        name: initialManifest.name,
        baseUrl: initialManifest.baseUrl,
      }, manifest) as TManifest,
      release,
      importMap: { imports: {} },
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
      opts.importMap!.imports = buildImportMap(opts.manifest).imports;
    });
  };
  const mountPoint = mount({
    vol,
    fs: {
      rm: (path) => {
        delete inMemoryFS[path];
        isCodeFile(path) && rebuild(updateManifest);
        isDecofilePath(path) && updateRelease();
        return Promise.resolve();
      },
      write: (path, content) => {
        inMemoryFS[path] = { content };
        isCodeFile(path) &&
          updateLoadCache(toFileUrl(join(Deno.cwd(), path)).href, content);
        isCodeFile(path) && rebuild(updateManifest);
        isDecofilePath(path) && updateRelease();
        return Promise.resolve();
      },
    },
  });
  const currentDispose = release?.dispose;
  release.dispose = () => {
    currentDispose?.();
    mountPoint[Symbol.dispose]();
  };
  return promise.then((opts) => {
    return newContext(
      opts.manifest,
      opts.importMap,
      opts.release,
      undefined,
      currentContext.site,
    );
  });
};
