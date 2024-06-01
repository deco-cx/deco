import { parse } from "std/flags/mod.ts";
import * as colors from "std/fmt/colors.ts";
import { ENV_SITE_NAME } from "../engine/decofile/constants.ts";
import { formatLog } from "../utils/log.ts";
import { Hypervisor } from "./hypervisor.ts";
import { portPool } from "./workers/portpool.ts";
const parsedArgs = parse(Deno.args, {
  string: ["build-cmd", "build-files"],
});
const runCommand = parsedArgs["_"];
if (import.meta.main && !runCommand || runCommand.length === 0) {
  console.error("No command provided.");
  Deno.exit(1);
}

const DECO_SITE_NAME = Deno.env.get(ENV_SITE_NAME);
const DECO_ENV_NAME = Deno.env.get("DECO_ENV_NAME");
const EXTERNAL_DOMAIN = `${DECO_ENV_NAME}--${DECO_SITE_NAME}.deco.site`;

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
const hypervisor = new Hypervisor({
  run: runCmd,
  build: buildCmd,
  buildFiles: parsedArgs["build-files"],
  port: APP_PORT,
  site: DECO_SITE_NAME,
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
    hypervisor.persistState();
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
      const p = hypervisor.proxySignal(signal);
      if (shouldExit) {
        // shutdown?.();
        hypervisor.shutdown?.();
        p.finally(() => {
          Deno.exit(0);
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
          const { connect } = await import("jsr:@deco/warp@0.2.4");

          const register = async () => {
            await connect({
              domain: EXTERNAL_DOMAIN,
              localAddr: `http://localhost:${port}`,
              server: "wss://simpletunnel.deco.site",
              apiKey: Deno.env.get("DECO_TUNNEL_SERVER_TOKEN") ??
                "c309424a-2dc4-46fe-bfc7-a7c10df59477",
            }).then((r) => {
              r.registered.then(() => {
                console.log(colors.green(
                  `Server running on https://${EXTERNAL_DOMAIN} -> ${address}`,
                ));
              });
              return r.closed.then(async () => {
                console.log("tunnel connection error retrying in 500ms...");
                await new Promise((resolve) => setTimeout(resolve, 500));
                return register();
              });
            }).catch(async (_err) => {
              console.log("tunnel connection error retrying in 500ms...");
              await new Promise((resolve) => setTimeout(resolve, 500));
              return register();
            });
          };
          await register();
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
      return response = hypervisor.fetch(req);
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
