/**
 * Builds and runs a Fresh + deco site as a Cloudflare Worker (experimental).
 * Run it from the site root:
 *
 *   deno eval 'import "@deco/deco/scripts/workerd"' -- init   # wrangler.jsonc
 *   deno eval 'import "@deco/deco/scripts/workerd"' -- build  # dist/worker
 *   deno eval 'import "@deco/deco/scripts/workerd"' -- dev    # wrangler dev
 *
 * `build` needs the Fresh snapshot in _fresh/ (`deno task build`) and Deno
 * >= 2.4 (`deno bundle`). Output:
 *
 *   dist/worker/server/index.js  Worker entry (createWorker from ./workerd)
 *   dist/worker/server/app.js    the site: Fresh + deco + apps, one bundle
 *   dist/worker/server/vfs.js    .deco/blocks, _fresh/snapshot.json, deno.json
 *   dist/worker/assets/          static/ + islands at /_frsh/js/<BUILD_ID>/
 *
 * Flags: `--no-minify`. Set DECO_LINK=/path/to/deco to bundle against a local
 * deco checkout (its version must match the site's @deco/deco).
 */
import { copy, emptyDir, exists, walk } from "@std/fs";
import { join, relative, resolve, toFileUrl } from "@std/path";
import { SCHEMAS_FILE } from "../runtime/workerd/worker.ts";

const ROOT = Deno.cwd();
const OUT = join(ROOT, "dist", "worker");
const SERVER = join(OUT, "server");
const ASSETS = join(OUT, "assets");
const SRC = join(OUT, "src");
const FRESH = join(ROOT, "_fresh");
/** Deno.cwd() inside the Worker. */
const APP_ROOT = "/app";
const WRANGLER_CONFIG = join(ROOT, "wrangler.jsonc");
/** The workerd date this build was tested with (node:perf_hooks, etc.). */
const COMPATIBILITY_DATE = "2026-11-01";

const fail = (message: string): never => {
  console.error(`workerd: ${message}`);
  Deno.exit(1);
};

const readSiteConfig = async () => {
  const path = join(ROOT, "deno.json");
  if (!(await exists(path))) fail("run it from a site root with deno.json");
  return JSON.parse(await Deno.readTextFile(path)) as {
    imports?: Record<string, string>;
    [key: string]: unknown;
  };
};

const wranglerConfig = (name: string) =>
  `{
  // Cloudflare Worker for this deco site. Build: dist/worker (see
  // @deco/deco/scripts/workerd). Secrets: \`npx wrangler secret put NAME\`.
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": ${JSON.stringify(name)},
  "main": "dist/worker/server/index.js",
  "compatibility_date": "${COMPATIBILITY_DATE}",
  "compatibility_flags": ["nodejs_compat"],
  // Already bundled by \`deno bundle\`; wrangler only uploads.
  "no_bundle": true,
  "base_dir": "dist/worker/server",
  "find_additional_modules": true,
  "rules": [{ "type": "ESModule", "globs": ["**/*.js"] }],
  "assets": { "directory": "dist/worker/assets", "binding": "ASSETS" },
  // No *.workers.dev / preview URLs: they bypass the zone WAF that blocks
  // /.decofile and /deco/meta on the site's real hostnames.
  "workers_dev": false,
  "preview_urls": false,
  "observability": { "enabled": true },
  "vars": {
    "DECO_SITE_NAME": ${JSON.stringify(name)}
  }
}
`;

async function init() {
  if (await exists(WRANGLER_CONFIG)) {
    console.log("wrangler.jsonc already exists");
    return;
  }
  const name = Deno.env.get("DECO_SITE_NAME") ??
    ROOT.split("/").filter(Boolean).pop()!;
  await Deno.writeTextFile(WRANGLER_CONFIG, wranglerConfig(name));
  console.log(`created wrangler.jsonc for "${name}"`);
}

const run = async (cmd: string, args: string[], quiet = false) => {
  const { code, stderr } = await new Deno.Command(cmd, {
    args,
    cwd: ROOT,
    stdout: "inherit",
    stderr: quiet ? "piped" : "inherit",
  }).output();
  if (code !== 0) {
    if (quiet) console.error(new TextDecoder().decode(stderr));
    Deno.exit(code);
  }
};

/**
 * workerd runs every module body in "global scope", where timers, random
 * values and I/O are forbidden, even for modules imported lazily from a
 * handler. Fresh, deco and the apps do all three at module level. This turns
 * the (unminified) bundle into a module that only exports `boot()`, whose
 * body is the original bundle; `node:*` imports stay at the top level.
 */
const wrapInBoot = async (path: string, selfUrl: string) => {
  const imports: string[] = [];
  const body: string[] = [];
  for (const line of (await Deno.readTextFile(path)).split("\n")) {
    if (/^import .* from "node:[^"]+";$/.test(line)) imports.push(line);
    else body.push(line);
  }
  // The bundle ends with `export {\n  a,\n  b as c\n};` (plus legal comments).
  const start = body.lastIndexOf("export {");
  const end = body.indexOf("};", start);
  if (start === -1 || end === -1) fail(`no export block in ${path}`);
  const exported = body.splice(start, end - start + 1).join("\n")
    .replace(/^export \{/, "")
    .replace(/\};?\s*$/, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [local, name] = s.split(/\s+as\s+/);
      return `${name ?? local}: ${local}`;
    });
  const url = JSON.stringify(selfUrl);
  await Deno.writeTextFile(
    path,
    [
      ...imports,
      "export async function boot() {",
      // import.meta.url is undefined on workerd.
      body.join("\n")
        .replaceAll("import.meta.url", url)
        .replaceAll(
          "import.meta.resolve(",
          `((s) => new URL(s, ${url}).href)(`,
        ),
      `return { ${exported.join(", ")} };`,
      "}",
    ].join("\n"),
  );
};

async function build() {
  const minify = !Deno.args.includes("--no-minify");
  const siteConfig = await readSiteConfig();
  if (!(await exists(join(FRESH, "snapshot.json")))) {
    fail("missing _fresh/snapshot.json, run `deno task build` first");
  }
  if (!siteConfig.imports?.["deco/"]) {
    fail('the site import map needs "deco/" (used by deco/plugins/deco.ts)');
  }

  await emptyDir(OUT);
  await Deno.mkdir(SERVER, { recursive: true });
  await Deno.mkdir(SRC, { recursive: true });

  // 1. Static assets: static/ and the Fresh islands.
  if (await exists(join(ROOT, "static"))) {
    await copy(join(ROOT, "static"), ASSETS, { overwrite: true });
  }
  const snapshot = JSON.parse(
    await Deno.readTextFile(join(FRESH, "snapshot.json")),
  ) as { build_id: string; files: Record<string, string[]> };
  const islandsDir = join(ASSETS, "_frsh", "js", snapshot.build_id);
  await Deno.mkdir(islandsDir, { recursive: true });
  for (const file of Object.keys(snapshot.files)) {
    await Deno.copyFile(join(FRESH, file), join(islandsDir, file));
  }
  if (await exists(join(FRESH, "static"))) {
    await copy(join(FRESH, "static"), ASSETS, { overwrite: true });
  }

  // A copy of the site config for the deno subprocesses (schemas, bundles),
  // so DECO_LINK can add `links`. Removed at the end.
  const config = join(ROOT, ".deno.worker.json");
  const linkEnv = Deno.env.get("DECO_LINK");
  const link = linkEnv ? resolve(ROOT, linkEnv) : undefined;
  await Deno.writeTextFile(
    config,
    JSON.stringify({
      ...siteConfig,
      nodeModulesDir: "none",
      ...(link ? { links: [link] } : {}),
    }),
  );
  try {
    await buildServer(siteConfig, snapshot, config, minify, link);
  } finally {
    await Deno.remove(config);
  }

  for (const file of ["index.js", "app.js", "vfs.js"]) {
    const { size } = await Deno.stat(join(SERVER, file));
    console.log(`${file.padEnd(9)} ${(size / 1024 / 1024).toFixed(2)} MB`);
  }
  if (!(await exists(WRANGLER_CONFIG))) {
    console.log("no wrangler.jsonc yet: run the `init` command");
  } else {
    // An existing config is not rewritten by `init`: flag the WAF bypass.
    const text = await Deno.readTextFile(WRANGLER_CONFIG);
    for (const key of ["workers_dev", "preview_urls"]) {
      if (!new RegExp(`"${key}"\\s*:\\s*false`).test(text)) {
        console.warn(
          `warning: wrangler.jsonc should set "${key}": false. A *.workers.dev ` +
            "or preview URL bypasses the zone WAF that blocks /.decofile and " +
            "/deco/meta.",
        );
      }
    }
  }
}

async function buildServer(
  siteConfig: Record<string, unknown>,
  snapshot: { build_id: string; files: Record<string, string[]> },
  config: string,
  minify: boolean,
  link: string | undefined,
) {
  // 2. Files the runtime reads at boot, served by the Deno shim.
  const files: Record<string, string> = {
    [`${APP_ROOT}/_fresh/snapshot.json`]: JSON.stringify(snapshot),
    [`${APP_ROOT}/deno.json`]: JSON.stringify(siteConfig),
    // Fresh walks the static dir; Workers Static Assets serves it instead.
    [`${APP_ROOT}/static/`]: "",
  };
  const blocks = join(ROOT, ".deco", "blocks");
  if (await exists(blocks)) {
    for await (const entry of walk(blocks, { includeDirs: false })) {
      files[`${APP_ROOT}/${relative(ROOT, entry.path)}`] = await Deno
        .readTextFile(entry.path);
    }
  }
  // The editor's static schemas (/deco/meta). Generating them parses the
  // site's TypeScript, which the Worker cannot do at runtime.
  const schemasOut = join(OUT, "schemas.gen.json");
  await run(Deno.execPath(), [
    "run",
    "-A",
    "--quiet",
    "--config",
    config,
    // With DECO_LINK, the generator must come from the same checkout as
    // the bundle (links don't redirect this URL's relative imports).
    link
      ? toFileUrl(join(link, "scripts", "workerd_schemas.ts")).href
      : new URL("./workerd_schemas.ts", import.meta.url).href,
    schemasOut,
  ], true);
  files[SCHEMAS_FILE] = await Deno.readTextFile(schemasOut);
  await Deno.remove(schemasOut);
  await Deno.writeTextFile(
    join(SERVER, "vfs.js"),
    `export default ${JSON.stringify(files)};\n`,
  );

  // 3. Generated sources.
  const site = (file: string) => toFileUrl(join(ROOT, file)).href;
  await Deno.writeTextFile(
    join(SRC, "app.ts"),
    `import { createHandler } from "$fresh/server.ts";
import { freshForWorkerd } from "@deco/deco/workerd";
import * as DispatchAsyncRender from "deco/runtime/fresh/islands/DispatchAsyncRender.tsx";
import manifest from "${site("fresh.gen.ts")}";
import config from "${site("fresh.config.ts")}";

export function createApp() {
  const app = freshForWorkerd(manifest, config, {
    pluginIslands: { "DispatchAsyncRender.tsx": DispatchAsyncRender },
    root: "${APP_ROOT}",
  });
  return createHandler(app.manifest, app.config);
}
`,
  );
  await Deno.writeTextFile(
    join(SRC, "index.ts"),
    `import { createWorker } from "@deco/deco/workerd";
// @ts-ignore: generated
import files from "./vfs.js";

export default createWorker({
  files,
  // @ts-ignore: generated
  boot: () => import("./app.js").then((m) => m.boot()).then((a) => a.createApp()),
});
`,
  );

  // 4. Bundles.
  const bundle = (entry: string, out: string, opts: {
    external?: string[];
    minify?: boolean;
  } = {}) =>
    run(Deno.execPath(), [
      "bundle",
      "--quiet",
      "--allow-import",
      "--platform=deno",
      "--config",
      config,
      ...(opts.minify ? ["--minify"] : []),
      ...(opts.external ?? []).flatMap((e) => ["--external", e]),
      "--output",
      join(SERVER, out),
      entry,
    ], true);
  // Fresh only loads esbuild to build islands without a snapshot.
  const external = ["https://deno.land/x/esbuild@*"];
  await bundle(join(SRC, "app.ts"), "app.js", { external });
  // wrapInBoot reads the readable output, so minify in a second pass.
  await wrapInBoot(join(SERVER, "app.js"), `file://${APP_ROOT}/app.js`);
  if (minify) {
    await bundle(join(SERVER, "app.js"), "app.js", {
      external: [...external, "node:*"],
      minify,
    });
  }
  await bundle(join(SRC, "index.ts"), "index.js", {
    external: ["./app.js", "./vfs.js"],
    minify,
  });
}

const command = Deno.args[0];
if (command === "init") {
  await init();
} else if (command === "build") {
  await build();
} else if (command === "dev") {
  await run("npx", ["-y", "wrangler@4", "dev", ...Deno.args.slice(1)]);
} else {
  fail("usage: workerd <init|build|dev> [--no-minify]");
}
