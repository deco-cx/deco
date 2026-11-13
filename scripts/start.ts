/**
 * `deno task start` (`https://deco.cx/run -- deno task dev`): keeps the site's
 * generated files up to date and runs its dev command.
 *
 * - Generates `manifest.gen.ts` and the blocks metadata once, before the site
 *   starts.
 * - Regenerates `manifest.gen.ts` when a `.ts`/`.tsx` file is created or
 *   deleted (Fresh only reads the manifest at boot), and the blocks metadata
 *   when something under `.deco/blocks` changes.
 * - Runs the command after `--` (the site's `deno task dev`) with the same
 *   stdio, and exits with its code. Code changes reload through the site's own
 *   dev server (`--watch-hmr` / `--unstable-hmr`).
 */
import { parseArgs } from "@std/cli";
import * as colors from "@std/fmt/colors";
import { BLOCKS_FOLDER, DECO_FOLDER } from "../engine/decofile/constants.ts";
import { genMetadata } from "../engine/decofile/fsFolder.ts";
import { delay, throttle } from "../utils/async.ts";
import { bundleApp } from "./apps/bundle.lib.ts";

// `--build-cmd` is accepted and ignored: older `start` tasks still pass it.
const parsed = parseArgs(Deno.args, { string: ["build-cmd"], "--": true });
const command = [...parsed._.map(String), ...(parsed["--"] ?? [])];
const appName = Deno.env.get("DECO_APP_NAME") ?? "site";
const VERBOSE = Deno.env.get("VERBOSE");

const bundle = bundleApp(Deno.cwd());
const genManifest = throttle(async () => {
  try {
    await Promise.all([bundle({ dir: ".", name: appName }), delay(300)]);
  } catch (error) {
    console.error("Error while generating the manifest", error);
  }
});
const genBlocks = throttle(async () => {
  await Promise.all([genMetadata(), delay(300)]);
});

const timed = async (label: string, fn: () => Promise<void>) => {
  const start = performance.now();
  await fn();
  console.log(
    `${colors.bold(label)} took ${(performance.now() - start).toFixed(0)}ms`,
  );
};

const watch = async () => {
  const blocksDir = `${DECO_FOLDER}/${BLOCKS_FOLDER}`;
  for await (const event of Deno.watchFs(Deno.cwd(), { recursive: true })) {
    const paths = event.paths.filter((path) =>
      !path.includes(".git") && !path.includes("node_modules")
    );
    if (paths.length === 0) continue;
    if (VERBOSE) console.log(event.kind, ...paths);

    if (paths.some((path) => path.includes(blocksDir))) {
      genBlocks();
    }
    const codeCreatedOrDeleted = event.kind !== "modify" &&
      event.kind !== "access" &&
      paths.some((path) =>
        /\.tsx?$/.test(path) && !path.includes("manifest.gen.ts")
      );
    if (codeCreatedOrDeleted) {
      genManifest();
    }
  }
};

await timed("Manifest generation", genManifest);
await timed("Blocks metadata generation", genBlocks);
watch().catch((error) => console.error("File watcher stopped:", error));

if (command.length === 0) {
  console.error(
    "Nothing to run. Usage: deno run -A https://deco.cx/run -- deno task dev",
  );
  Deno.exit(1);
}

const [cmd, ...args] = command;
const child = new Deno.Command(cmd, {
  args,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

const signals: Deno.Signal[] = Deno.build.os === "windows"
  ? ["SIGINT"]
  : ["SIGINT", "SIGTERM"];
for (const signal of signals) {
  Deno.addSignalListener(signal, () => {
    try {
      child.kill(signal);
    } catch {
      // already exited
    }
  });
}

const { code } = await child.status;
Deno.exit(code);
