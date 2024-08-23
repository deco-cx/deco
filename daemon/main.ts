import { Hono, type MiddlewareHandler } from "@hono/hono";
import { logger } from "@hono/hono/logger";
import { parseArgs } from "@std/cli";
import * as colors from "@std/fmt/colors";
import { ensureDir } from "@std/fs";
import { dirname, join } from "@std/path";
import denoJSON from "../deno.json" with { type: "json" };
import {
  BLOCKS_FOLDER,
  DECO_FOLDER,
  ENV_SITE_NAME,
} from "../engine/decofile/constants.ts";
import { genMetadata } from "../engine/decofile/fsFolder.ts";
import { bundleApp } from "../scripts/apps/bundle.lib.ts";
import { delay, throttle } from "../utils/async.ts";
import { createDaemonAPIs, DECO_ENV_NAME, DECO_SITE_NAME } from "./daemon.ts";
import { ensureGit, lockerGitAPI } from "./git.ts";
import { logs } from "./loggings/stream.ts";
import { activityMonitor, createIdleHandler } from "./monitor.ts";
import { register } from "./tunnel.ts";
import { createWorker } from "./worker.ts";
import { portPool } from "./workers/portpool.ts";

const parsedArgs = parseArgs(Deno.args, {
  string: ["build-cmd"],
});
const runCommand = parsedArgs["_"];

const DECO_APP_NAME = Deno.env.get("DECO_APP_NAME");
const DENO_DEPLOYMENT_ID = Deno.env.get("DENO_DEPLOYMENT_ID");
const SOURCE_PATH = Deno.env.get("SOURCE_ASSET_PATH");
const DECO_TRANSIENT_ENV = Deno.env.get("DECO_TRANSIENT_ENV") === "true";
const SHOULD_PERSIST = DENO_DEPLOYMENT_ID && SOURCE_PATH && !DECO_TRANSIENT_ENV;
const VERBOSE = Deno.env.get("VERBOSE") || DENO_DEPLOYMENT_ID;

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
    env: {
      PORT: `${WORKER_PORT}`,
      ...Deno.env.get("DENO_DIR_RUN")
        ? { DENO_DIR: Deno.env.get("DENO_DIR_RUN") }
        : {},
    },
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

const createBundler = (appName?: string) => {
  const bundler = bundleApp(Deno.cwd());

  return async () => {
    try {
      await bundler({ dir: ".", name: appName ?? "site" });
    } catch (error) {
      console.error("Error while bundling site app", error);
    }
  };
};

const persist = async () => {
  try {
    if (!SHOULD_PERSIST) {
      return;
    }

    const start = performance.now();

    const outfilePath = join(
      dirname(SOURCE_PATH!),
      `${DENO_DEPLOYMENT_ID}.tar`,
    );
    await ensureDir(dirname(outfilePath));

    const tar = new Deno.Command("tar", {
      cwd: Deno.cwd(),
      args: ["-cf", outfilePath, "--exclude=node_modules", "."],
    });

    const status = await tar.spawn().status;

    console.log(
      `[tar]: Tarballing took ${(performance.now() - start).toFixed(0)}ms`,
    );

    if (!status.success) {
      throw new Error("Failed to tarball");
    }
  } catch (error) {
    console.error("Error while persisting", error);
  }
};

const bundle = createBundler(DECO_APP_NAME);
const genManifestTS = throttle(async () => {
  await Promise.all([bundle(), delay(300)]);
});
const genBlocksJSON = throttle(async () => {
  await Promise.all([genMetadata(), delay(300)]);
});
const persistState = throttle(async () => {
  await Promise.all([persist(), delay(2 * 60 * 1_000)]);
});

// Watch for changes in filesystem
// TODO: we should be able to completely remove this after in some point in the future
const watch = async () => {
  const watcher = Deno.watchFs(Deno.cwd(), { recursive: true });

  for await (const event of watcher) {
    using _ = await lockerGitAPI.lock.rlock();
    const skip = event.paths.some((path) =>
      path.includes(".git") || path.includes("node_modules")
    );

    if (skip) {
      continue;
    }

    if (VERBOSE) {
      console.log(event.kind, ...event.paths);
    }

    // TODO: remove genBlocksJSON after we stop using old FS API
    const isBlockChanged = event.paths.some((path) =>
      path.includes(`${DECO_FOLDER}/${BLOCKS_FOLDER}`)
    );

    if (isBlockChanged) {
      genBlocksJSON();
    }

    /** We should move this to the new FS api */
    const codeCreatedOrDeleted = event.kind !== "modify" &&
      event.kind !== "access" && event.paths.some((path) => (
        /\.tsx?$/.test(path) && !path.includes("manifest.gen.ts")
      ));

    if (codeCreatedOrDeleted) {
      genManifestTS();
    }

    // TODO: We should be able to remove this after we migrate to ebs
    persistState();
  }
};

const createDeps = (): MiddlewareHandler => {
  let ok: Promise<unknown> | null | false = null;

  const start = async () => {
    let start = performance.now();
    await ensureGit({ site: DECO_SITE_NAME! });
    logs.push({
      level: "info",
      message: `${colors.bold("[step 1/4]")}: Git setup took ${
        (performance.now() - start).toFixed(0)
      }ms`,
    });

    start = performance.now();
    await genManifestTS();
    logs.push({
      level: "info",
      message: `${colors.bold("[step 2/4]")}: Manifest generation took ${
        (performance.now() - start).toFixed(0)
      }ms`,
    });

    start = performance.now();
    await genBlocksJSON();
    logs.push({
      level: "info",
      message: `${colors.bold("[step 3/4]")}: Blocks metadata generation took ${
        (performance.now() - start).toFixed(0)
      }ms`,
    });

    watch();
    logs.push({
      level: "info",
      message: `${
        colors.bold("[step 4/4]")
      }: Started file watcher in background`,
    });
  };

  return async (c, next) => {
    try {
      ok ||= start();

      await ok.then(next);
    } catch (err) {
      console.log(err);

      c.res = new Response("Error while starting global deps", { status: 424 });
    }
  };
};

const app = new Hono();

if (VERBOSE) {
  app.use(logger());
}

app.get("/_healthcheck", () =>
  new Response(denoJSON.version, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  }));

// Globals are started after healthcheck to ensure k8s does not kill the pod before it is ready
app.use(createDeps());
// k8s liveness probe
app.get("/deco/_liveness", () => new Response("OK", { status: 200 }));
app.get("/deco/_is_idle", createIdleHandler(DECO_SITE_NAME!, DECO_ENV_NAME!));
app.use(activityMonitor);
// These are the APIs that communicate with admin UI
app.use(createDaemonAPIs({ build: buildCmd, site: DECO_SITE_NAME }));
// Workers are only necessary if there needs to have a preview of the site
if (runCmd) {
  app.route("", createWorker({ command: runCmd, port: WORKER_PORT, persist }));
}

const port = Number(Deno.env.get("APP_PORT")) || 8000;
Deno.serve({
  port,
  onListen: async (addr) => {
    try {
      if (DECO_ENV_NAME && DECO_SITE_NAME && !Deno.env.has("DECO_PREVIEW")) {
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
