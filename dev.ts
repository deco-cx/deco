import { setupGithooks } from "https://deno.land/x/githooks@0.0.4/githooks.ts";
import { dirname, fromFileUrl, join, toFileUrl } from "std/path/mod.ts";
import { gte } from "std/semver/mod.ts";

import { parse } from "std/flags/mod.ts";
import { ResolverMap } from "./engine/core/resolver.ts";
import { ManifestBuilder } from "./engine/manifest/manifestBuilder.ts";
import { decoManifestBuilder } from "./engine/manifest/manifestGen.ts";
import { genSchemas } from "./engine/schema/reader.ts";
import { context } from "./live.ts";
import { DecoManifest } from "./types.ts";
import { namespaceFromSiteJson, updateImportMap } from "./utils/namespace.ts";
import { checkUpdates } from "./utils/update.ts";
export { format } from "./utils/formatter.ts";

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
const importManifests = (manifests: string[]): Promise<
  Array<
    DecoManifest | (DecoManifest & Partial<Record<string, ResolverMap>>)
  >
> => {
  return Promise.all(
    manifests.map(async (manifest) => (await import(manifest)).default),
  );
};

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
    injectRoutes = true,
  }: {
    injectRoutes?: boolean;
    imports?:
      | Array<string>
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

  let manifest = await decoManifestBuilder(dir, ns, { injectRoutes });
  manifest = manifest.mergeWith(
    isDyamicImportArray(imports)
      ? await importManifests(imports)
      : typeof imports === "object"
      ? Object.values(imports)
      : imports,
  );

  oncePerRun(setupGithooks);

  await generate(dir, manifest);
  onListen?.();
  await import(entrypoint);
}

function isDyamicImportArray(
  imports:
    | string[]
    | (DecoManifest | (DecoManifest & Partial<Record<string, ResolverMap>>))[]
    | Record<
      string,
      DecoManifest | (DecoManifest & Partial<Record<string, ResolverMap>>)
    >,
): imports is string[] {
  return Array.isArray(imports) && imports.length > 0 &&
    typeof imports[0] === "string";
}

// Generate live own manifest data so that other sites can import native functions and sections.
export const liveNs = "$live";
if (import.meta.main) {
  const flags = parse(Deno.args, {
    boolean: ["print"],
  });
  context.namespace = liveNs;
  const dir = Deno.cwd();
  const newManifestData = await decoManifestBuilder(dir, liveNs);
  await generate(dir, newManifestData).then(async () => {
    await setManifest(dir);
    const schema = await genSchemas(context.manifest!);
    if (flags.print) {
      console.log(JSON.stringify(schema, null, 2));
    }
  });
}

async function setManifest(dir: string) {
  context.manifest =
    (await import(toFileUrl(join(dir, manifestFile)).toString())).default;
}
