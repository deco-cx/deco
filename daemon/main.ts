import { parse } from "std/flags/mod.ts";
import * as colors from "std/fmt/colors.ts";
import { ENV_SITE_NAME } from "../engine/decofile/constants.ts";
import { formatLog } from "../utils/log.ts";
import { Daemon, DECO_SITE_NAME } from "./daemon.ts";
import { register } from "./tunnel.ts";
import { portPool } from "./workers/portpool.ts";
const parsedArgs = parse(Deno.args, {
  string: ["build-cmd", "build-files"],
});
const runCommand = parsedArgs["_"];
if (import.meta.main && !runCommand || runCommand.length === 0) {
  console.error("No command provided.");
  Deno.exit(1);
}

const DECO_ENV_NAME = Deno.env.get("DECO_ENV_NAME");

const APP_PORT = portPool.get();

// let shutdown: (() => void) | undefined = undefined;
const [cmd, ...args] = runCommand as string[];
const [buildCmdStr, ...buildArgs] = parsedArgs["build-cmd"]?.split(" ") ?? [];

const buildCmd = new Deno.Command(buildCmdStr, {
  args: buildArgs,
  stdout: "inherit",
  stderr: "inherit",
});
const runCmd = new Deno.Command(cmd === "deno" ? Deno.execPath() : cmd, {
  args,
  stdout: "piped",
  stderr: "piped",
  env: { PORT: `${APP_PORT}` },
});
if (!DECO_SITE_NAME) {
  console.error(
    `site name not found. use ${ENV_SITE_NAME} environment variable to set it.`,
  );
  Deno.exit(1);
}
const daemon = new Daemon({
  run: runCmd,
  build: buildCmd,
  buildFiles: parsedArgs["build-files"],
  port: APP_PORT,
});

// unhandledrejection.js
globalThis.addEventListener(
  "unhandledrejection",
  (
    e: {
      promise: Promise<unknown>;
      reason: unknown;
      preventDefault: () => void;
    },
  ) => {
    daemon.persistState();
    console.log("unhandled rejection at:", e.promise, "reason:", e.reason);
  },
);

const appPort = Deno.env.get("APP_PORT");

const signals: Partial<Record<Deno.Signal, boolean>> = {
  SIGINT: true, //
  SIGTERM: true, //
};

for (const [_signal, shouldExit] of Object.entries(signals)) {
  const signal = _signal as Deno.Signal;
  try {
    Deno.addSignalListener(signal, () => {
      console.log(`Received ${signal}`);
      const p = daemon.proxySignal(signal);
      if (shouldExit) {
        // shutdown?.();
        daemon.shutdown?.();
        p.finally(() => {
          self.close();
        });
      }
    });
  } catch (_err) {
    // ignore
  }
}
const port = appPort ? +appPort : 8000;
Deno.serve(
  {
    port,
    onListen: async (addr) => {
      const address = `http://${addr.hostname}:${addr.port}`;
      try {
        if (DECO_ENV_NAME && DECO_SITE_NAME) {
          await register({
            site: DECO_SITE_NAME,
            env: DECO_ENV_NAME,
            port: `${port}`,
          });
        } else {
          console.log(
            colors.green(`Server running on ${address}`),
          );
        }
      } catch (err) {
        console.log(err);
      }
    },
  },
  (req) => {
    let response: Promise<Response> | null = null;
    const begin = performance.now();
    try {
      if (req.url.endsWith("/_healthcheck")) {
        return new Response(
          "OK",
          { status: 200 },
        );
      }
      return response = daemon.fetch(req);
    } finally {
      response?.then((resp) => {
        const logline = formatLog({
          begin,
          status: resp.status,
          url: new URL(req.url),
        });
        console.log(
          `  ${colors.gray(logline)}`,
        );
      });
    }
  },
);
