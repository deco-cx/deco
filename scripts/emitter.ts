import { build, initialize } from "https://deno.land/x/esbuild@v0.20.2/wasm.js";
import { debounce } from "std/async/debounce.ts";
import { dirname, join } from "std/path/mod.ts";
import { AppManifest } from "../mod.ts";
import { defaultFs, FS, mount } from "./mount.ts";

let initializePromise: Promise<void> | null = null;

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
  console.log("rebuilding");
  const start = performance.now();
  const contents = await bundle(inMemoryFS);
  console.log("took", performance.now() - start);
  const module = await import(
    `data:text/tsx,${encodeURIComponent(contents)}#manifest.gen.ts`
  );
  onEnd?.(module.default);
};

let queue = Promise.resolve();
const rebuild = debounce((onEnd?: (m: AppManifest) => void) => {
  queue = queue.then(() => rebuildInner(onEnd));
  return queue;
}, 500);

const isCodeFile = (path: string) =>
  path.endsWith(".tsx") || path.endsWith(".ts");

export interface DynamicManifest {
  handleChange: (cb: (man: AppManifest) => void) => void;
}

let prev: Disposable | null = null;
export const dynamicManifest = (
  cb: (man: AppManifest) => void,
) => {
  prev?.[Symbol.dispose]();
  queue = Promise.resolve();
  prev = mount({
    vol:
      "http://localhost:4200/live/invoke/deco-sites/admin/loaders/environments/watch.ts?site=storefront-vtex&head=a943f36d1b2a1b58724ea8f4505e3dcd945ed0f5&name=draft",
    fs: {
      rm: async (path) => {
        delete inMemoryFS[path];
        await underlyingFs.rm(path);
        isCodeFile(path) && rebuild(cb);
      },
      write: async (path, content) => {
        inMemoryFS[path] = { content };
        await underlyingFs.write(path, content);
        isCodeFile(path) && rebuild(cb);
      },
    },
  });
};
