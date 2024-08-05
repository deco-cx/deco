import { parse } from "std/flags/mod.ts";
import * as colors from "std/fmt/colors.ts";
import { ENV_SITE_NAME } from "../engine/decofile/constants.ts";
import {
  BLOCKS_FOLDER,
  DECO_FOLDER,
  genMetadata,
} from "../engine/decofile/fsFolder.ts";
import { bundleApp } from "../scripts/apps/bundle.lib.ts";
import { createDaemonAPIs, DECO_SITE_NAME } from "./daemon.ts";
import { Hono, logger } from "./deps.ts";
import { register } from "./tunnel.ts";
import { createWorker } from "./worker.ts";
import { portPool } from "./workers/portpool.ts";

const parsedArgs = parse(Deno.args, {
  string: ["build-cmd", "build-files"],
});
const runCommand = parsedArgs["_"];

const DECO_ENV_NAME = Deno.env.get("DECO_ENV_NAME");
const VERBOSE = import.meta.url.startsWith("file:");

const WORKER_PORT = portPool.get();

const [cmd, ...args] = runCommand as string[];
const [buildCmdStr, ...buildArgs] = parsedArgs["build-cmd"]?.split(" ") ?? [];

const buildCmd = buildCmdStr
  ? new Deno.Command(buildCmdStr, {
    args: buildArgs,
    stdout: "inherit",
    stderr: "inherit",
  })
  : null;
const runCmd = cmd
  ? new Deno.Command(cmd === "deno" ? Deno.execPath() : cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
    env: { PORT: `${WORKER_PORT}` },
  })
  : null;

if (!DECO_SITE_NAME) {
  console.error(
    `site name not found. use ${ENV_SITE_NAME} environment variable to set it.`,
  );
  Deno.exit(1);
}

globalThis.addEventListener("unhandledrejection", (e: {
  promise: Promise<unknown>;
  reason: unknown;
}) => {
  console.log("unhandled rejection at:", e.promise, "reason:", e.reason);
});

const createBundler = () => {
  const bundler = bundleApp(Deno.cwd());

  return async () => {
    try {
      await bundler({ dir: ".", name: "site" });
    } catch (error) {
      console.error("Error while bundling site app", error);
    }
  };
};

const throttle = (cb: () => Promise<void>) => {
  let queue = Promise.resolve();

  return () => {
    queue = queue.catch(() => null).then(cb);

    return queue;
  };
};

const genManifestTS = throttle(createBundler());
const genBlocksJSON = throttle(genMetadata);

// Watch for changes in filesystem
(async () => {
  const watcher = Deno.watchFs(Deno.cwd(), { recursive: true });

  for await (const event of watcher) {
    const isBlockChanged = event.paths.some((path) =>
      path.includes(`${DECO_FOLDER}/${BLOCKS_FOLDER}`)
    );

    if (isBlockChanged) {
      genBlocksJSON();
    }

    const codeCreatedOrDeleted = event.kind !== "modify" &&
      event.paths.some((path) => (
        path.endsWith(".ts") || path.endsWith(".tsx")
      ));

    if (codeCreatedOrDeleted) {
      genManifestTS();
    }
  }
})();

await genManifestTS();
await genBlocksJSON();

const isolate = runCmd && createWorker({ command: runCmd, port: WORKER_PORT });

const app = new Hono.Hono();
VERBOSE && app.use(logger());
app.get("/_healthcheck", () => new Response("OK", { status: 200 }));
app.use(
  createDaemonAPIs({
    build: buildCmd,
    site: DECO_SITE_NAME,
    worker: isolate?.worker,
  }),
);
isolate && app.route("", isolate.app);

const port = Number(Deno.env.get("APP_PORT")) || 8000;
Deno.serve({
  port,
  onListen: async (addr) => {
    try {
      if (DECO_ENV_NAME && DECO_SITE_NAME) {
        await register({
          site: DECO_SITE_NAME,
          env: DECO_ENV_NAME,
          port: `${port}`,
        });
      } else {
        console.log(
          colors.green(
            `Server running on http://${addr.hostname}:${addr.port}`,
          ),
        );
      }
    } catch (err) {
      console.log(err);
    }
  },
}, app.fetch);
