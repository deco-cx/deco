import { setupGithooks } from "https://deno.land/x/githooks@0.0.4/githooks.ts";
import { dirname, fromFileUrl, join } from "std/path/mod.ts";
import { gte } from "std/semver/mod.ts";

import { ResolverMap } from "$live/engine/core/resolver.ts";
import { ManifestBuilder } from "$live/engine/fresh/manifestBuilder.ts";
import { decoManifestBuilder } from "$live/engine/fresh/manifestGen.ts";
import { context } from "$live/live.ts";
import { DecoManifest } from "$live/types.ts";
import { genSchemas, reset } from "./engine/schema/reader.ts";
import { namespaceFromSiteJson, updateImportMap } from "./utils/namespace.ts";
import { checkUpdates } from "./utils/update.ts";

/**
 * Ensures that the target function runs only once per `deno task start`, in other words the watcher will not trigger the function again.
 */
const oncePerRun = (
  f: () => Promise<void>,
) => {
  const key = `LIVE_RUN_${f.name}`;
  if (Deno.env.has(key)) {
    return;
  }

  f().finally(() => {
    Deno.env.set(key, "true");
  });
};

const MIN_DENO_VERSION = "1.32.2";
export function ensureMinDenoVersion() {
  // Check that the minimum supported Deno version is being used.
  if (!gte(Deno.version.deno, MIN_DENO_VERSION)) {
    let message =
      `Deno version ${MIN_DENO_VERSION} or higher is required. Please update Deno.\n\n`;

    if (Deno.execPath().includes("homebrew")) {
      message +=
        "You seem to have installed Deno via homebrew. To update, run: `brew upgrade deno`\n";
    } else {
      message += "To update, run: `deno upgrade`\n";
    }

    console.error(message);
  }
}

const manifestFile = "./live.gen.ts";

export async function generate(
  directory: string,
  manifest: ManifestBuilder,
) {
  const fmt = new Deno.Command(Deno.execPath(), {
    args: ["fmt", "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "null",
  });
  const proc = fmt.spawn();
  const raw = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(manifest.build()));
      controller.close();
    },
  });
  await raw.pipeTo(proc.stdin);
  const out = await proc.output();
  await proc.status;
  proc.unref();

  const manifestStr = new TextDecoder().decode(out.stdout);
  const manifestPath = join(directory, manifestFile);

  await Deno.writeTextFile(manifestPath, manifestStr);
  console.log(
    `%cthe manifest has been generated.`,
    "color: blue; font-weight: bold",
  );
}

export const siteJSON = "site.json";

const getAndUpdateNamespace = async (
  dir: string,
): Promise<string | undefined> => {
  const ns = await namespaceFromSiteJson(dir);
  ns && oncePerRun(async function importMapUpdate() {
    await updateImportMap(dir, ns);
  });
  return ns;
};

export default async function dev(
  base: string,
  entrypoint: string,
  {
    imports = [],
    onListen,
  }: {
    imports?:
      | Array<
        DecoManifest | (DecoManifest & Partial<Record<string, ResolverMap>>)
      >
      | Record<
        string,
        DecoManifest | (DecoManifest & Partial<Record<string, ResolverMap>>)
      >;
    onListen?: () => void;
  } = {},
) {
  const dir = dirname(fromFileUrl(base));
  oncePerRun(async function check() {
    await checkUpdates(dir).catch((err) =>
      console.log("error when checking updates", err)
    );
  });
  const ns = await getAndUpdateNamespace(dir) ?? base;
  context.namespace = ns;
  ensureMinDenoVersion();

  entrypoint = new URL(entrypoint, base).href;

  let manifest = await decoManifestBuilder(dir, ns);
  manifest = manifest.mergeWith(
    typeof imports === "object" ? Object.values(imports) : imports,
  );

  oncePerRun(setupGithooks);

  await generate(dir, manifest);

  (async () => {
    context.manifest = (await import(join(dir, manifestFile))).default;
    await genSchemas();
    reset();
  })();

  onListen?.();

  await import(entrypoint);
}

export async function format(content: string) {
  const fmt = new Deno.Command(Deno.execPath(), {
    args: ["fmt", "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "null",
  });

  const proc = fmt.spawn();

  const raw = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(content));
      controller.close();
    },
  });

  await raw.pipeTo(proc.stdin);
  const out = await proc.output();
  await proc.status;

  return new TextDecoder().decode(out.stdout);
}

// Generate live own manifest data so that other sites can import native functions and sections.
export const liveNs = "$live";
if (import.meta.main) {
  context.namespace = liveNs;
  const dir = Deno.cwd();
  const newManifestData = await decoManifestBuilder(dir, liveNs);
  await generate(dir, newManifestData).then(async () => {
    context.manifest = (await import(join(dir, manifestFile))).default;
    await genSchemas();
  });
}
