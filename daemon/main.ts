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
import { createDaemonAPIs, DECO_SITE_NAME } from "./daemon.ts";
import { ensureGit } from "./git.ts";
import { register } from "./tunnel.ts";
import { createWorker } from "./worker.ts";
import { portPool } from "./workers/portpool.ts";

const parsedArgs = parseArgs(Deno.args, {
  string: ["build-cmd"],
});
const runCommand = parsedArgs["_"];

const DECO_ENV_NAME = Deno.env.get("DECO_ENV_NAME");
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
      args: ["-cf", outfilePath, "."],
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

const genManifestTS = throttle(createBundler());
const genBlocksJSON = throttle(genMetadata);
const persistState = throttle(async () => {
  await Promise.all([persist(), delay(2 * 60 * 1000)]);
});

// Watch for changes in filesystem
(async () => {
  const watcher = Deno.watchFs(Deno.cwd(), { recursive: true });

  for await (const event of watcher) {
    const skip = event.paths.some((path) => path.includes(".git"));

    if (skip) {
      continue;
    }

    if (VERBOSE) {
      console.log(event.kind, ...event.paths);
    }

    const isBlockChanged = event.paths.some((path) =>
      path.includes(`${DECO_FOLDER}/${BLOCKS_FOLDER}`)
    );

    if (isBlockChanged) {
      genBlocksJSON();
    }

    const codeCreatedOrDeleted = event.kind !== "modify" &&
      event.kind !== "access" &&
      event.paths.some((path) => (
        path.endsWith(".ts") || path.endsWith(".tsx")
      ));

    if (codeCreatedOrDeleted) {
      genManifestTS();
    }

    persistState();
  }
})();

const createDeps = (): MiddlewareHandler => {
  let ok: Promise<unknown> | null | false = null;

  const start = async () => {
    let start = performance.now();
    await ensureGit({ site: DECO_SITE_NAME! });
    let duration = performance.now() - start;
    console.log(
      `${colors.bold("[step 1/3]")}: Git setup took ${duration.toFixed(0)}ms`,
    );

    start = performance.now();
    await genManifestTS();
    duration = performance.now() - start;
    console.log(
      `${colors.bold("[step 2/3]")}: Manifest generation took ${
        duration.toFixed(0)
      }ms`,
    );

    start = performance.now();
    await genBlocksJSON();
    duration = performance.now() - start;
    console.log(
      `${colors.bold("[step 3/3]")}: Blocks metadata generation took ${
        duration.toFixed(0)
      }ms`,
    );
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
