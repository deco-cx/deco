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
import {
  createDaemonAPIs,
  DECO_ENV_NAME,
  DECO_HOST,
  DECO_SITE_NAME,
} from "./daemon.ts";
import { watchFS } from "./fs/api.ts";
import { ensureGit, getGitHubPackageTokens, lockerGitAPI } from "./git.ts";
import { logs } from "./loggings/stream.ts";
import { watchMeta } from "./meta.ts";
import { activityMonitor, createIdleHandler } from "./monitor.ts";
import { register } from "./tunnel.ts";
import { createWorker, type WorkerOptions } from "./worker.ts";
import { portPool } from "./workers/portpool.ts";

const parsedArgs = parseArgs(Deno.args, {
  string: ["build-cmd"],
});
const runCommand = parsedArgs["_"];

const DECO_APP_NAME = Deno.env.get("DECO_APP_NAME");
export const DENO_DEPLOYMENT_ID: string | undefined = Deno.env.get(
  "DENO_DEPLOYMENT_ID",
);
const SOURCE_PATH = Deno.env.get("SOURCE_ASSET_PATH");
const DECO_TRANSIENT_ENV = Deno.env.get("DECO_TRANSIENT_ENV") === "true";
const SHOULD_PERSIST = DENO_DEPLOYMENT_ID && SOURCE_PATH && !DECO_TRANSIENT_ENV;
export const VERBOSE: string | undefined = Deno.env.get("VERBOSE") ||
  DENO_DEPLOYMENT_ID;
const DENO_AUTH_TOKENS = "DENO_AUTH_TOKENS";
const UNSTABLE_WORKER_RESPAWN_INTERVAL_MS_ENV_NAME =
  "UNSTABLE_WORKER_RESPAWN_INTERVAL_MS";
const UNSTABLE_WORKER_RESPAWN_INTERVAL_MS =
  Deno.env.get(UNSTABLE_WORKER_RESPAWN_INTERVAL_MS_ENV_NAME) &&
    !Number.isNaN(
      parseInt(Deno.env.get(UNSTABLE_WORKER_RESPAWN_INTERVAL_MS_ENV_NAME)!, 10),
    )
    ? parseInt(Deno.env.get(UNSTABLE_WORKER_RESPAWN_INTERVAL_MS_ENV_NAME)!, 10)
    : undefined; // 1hour
const HAS_PRIVATE_GITHUB_IMPORT = Deno.env.get("HAS_PRIVATE_GITHUB_IMPORT");

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

const getEnvVar = (envName: string, varName: string) =>
  Deno.env.get(envName) ? { [varName]: Deno.env.get(envName) } : {};

const createRunCmd = cmd
  ? (opt?: Pick<Deno.CommandOptions, "env">) =>
    new Deno.Command(cmd === "deno" ? Deno.execPath() : cmd, {
      args,
      stdout: "piped",
      stderr: "piped",
      env: {
        ...opt?.env,
        PORT: `${WORKER_PORT}`,
        ...getEnvVar(DENO_AUTH_TOKENS, DENO_AUTH_TOKENS),
        ...getEnvVar("DENO_DIR_RUN", "DENO_DIR"),
      },
    })
  : null;

let lastUpdateEnvUpdate: number | undefined;
const updateDenoAuthTokenEnv = async () => {
  if (
    !UNSTABLE_WORKER_RESPAWN_INTERVAL_MS ||
    lastUpdateEnvUpdate &&
      Date.now() < lastUpdateEnvUpdate
  ) return;
  lastUpdateEnvUpdate = Date.now() + UNSTABLE_WORKER_RESPAWN_INTERVAL_MS;

  const appTokens = await getGitHubPackageTokens();
  // TODO: handle if DENO_AUTH_TOKENS is already set
  Deno.env.set(
    DENO_AUTH_TOKENS,
    appTokens.map((token) => `${token}@raw.githubusercontent.com`).join(
      ";",
    ),
  );
};

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

    if (HAS_PRIVATE_GITHUB_IMPORT) {
      updateDenoAuthTokenEnv();
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

    watch().catch(console.error);
    watchMeta().catch(console.error);
    watchFS().catch(console.error);

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

app.get("/_healthcheck", (c) => {
  const timestamp = +(c.req.header("x-hc-retry-timestamp") ?? "0");
  const attempt = +(c.req.header("x-hc-retry-attempt") ?? "0");
  console.log("healthcheck received", {
    timestamp: new Date(timestamp).toISOString(),
    attempt,
  });

  return new Response(denoJSON.version, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
});
// idle should run even when branch is not active
app.get("/deco/_is_idle", createIdleHandler(DECO_SITE_NAME!, DECO_ENV_NAME!));
// k8s liveness probe
app.get("/deco/_liveness", () => new Response("OK", { status: 200 }));

// Globals are started after healthcheck to ensure k8s does not kill the pod before it is ready
app.use(createDeps());
app.use(activityMonitor);
// These are the APIs that communicate with admin UI
app.use(createDaemonAPIs({ build: buildCmd, site: DECO_SITE_NAME }));
// Workers are only necessary if there needs to have a preview of the site
if (createRunCmd) {
  // Create a function that returns fresh WorkerOptions with new tokens
  const createWorkerOptions = async (): Promise<WorkerOptions> => {
    if (HAS_PRIVATE_GITHUB_IMPORT) {
      await updateDenoAuthTokenEnv();
    }

    if (UNSTABLE_WORKER_RESPAWN_INTERVAL_MS) {
      /* TODO: Implement a better approach handling updating child env vars, preventing multiple child processes and with HMR.
       * Also should have the git short live auth token to do git operations like: push/pull/rebase. Now, these git operations are guaranted
       * because the short live git token is set once in inicialization and respawning
       */
      // Kill process to allow restart with new env settings
      setTimeout(() => {
        Deno.exit(1);
      }, UNSTABLE_WORKER_RESPAWN_INTERVAL_MS);
    }

    return {
      command: createRunCmd(), // This will create a fresh command with new tokens
      port: WORKER_PORT,
      persist,
    };
  };

  app.route("", createWorker(createWorkerOptions));
}

const LOCAL_STORAGE_ENV_NAME = "deco_host_env_name";
const stableEnvironmentName = () => {
  const savedEnvironment = localStorage.getItem(LOCAL_STORAGE_ENV_NAME);
  if (savedEnvironment) {
    return savedEnvironment;
  }

  const newEnvironment = `${crypto.randomUUID().slice(0, 6)}-localhost`;
  localStorage.setItem(LOCAL_STORAGE_ENV_NAME, newEnvironment);
  return newEnvironment;
};
const port = Number(Deno.env.get("APP_PORT")) || 8000;
Deno.serve({
  port,
  onListen: async (addr) => {
    try {
      const env = DECO_HOST && !DECO_ENV_NAME
        ? stableEnvironmentName()
        : DECO_ENV_NAME;
      if (env && DECO_SITE_NAME && !Deno.env.has("DECO_PREVIEW")) {
        await register({
          site: DECO_SITE_NAME,
          env,
          port: `${port}`,
          decoHost: DECO_HOST,
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
