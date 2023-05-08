import { setupGithooks } from "https://deno.land/x/githooks@0.0.4/githooks.ts";
import { dirname, fromFileUrl, join } from "std/path/mod.ts";
import { gte } from "std/semver/mod.ts";

import { ResolverMap } from "$live/engine/core/resolver.ts";
import {
  ManifestBuilder,
  newManifestBuilder,
} from "$live/engine/fresh/manifestBuilder.ts";
import { decoManifestBuilder } from "$live/engine/fresh/manifestGen.ts";
import { genSchemasFromManifest } from "$live/engine/schema/gen.ts";
import { context } from "$live/live.ts";
import { DecoManifest } from "$live/types.ts";
import { exists } from "$live/utils/filesystem.ts";
import { namespaceFromImportMap } from "$live/utils/namespace.ts";
import { SiteInfo } from "./types.ts";
import { checkUpdates } from "./utils/update.ts";

const schemaFile = "schemas.gen.json";

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

const genSchemas = async (
  base: string,
  manifest: string,
  directory: string,
) => {
  manifest = new URL(manifest, base).href;

  console.log(`🌟 live.ts is spinning up some magic for you! ✨ Hold tight!`);

  await Deno.writeTextFile(
    join(directory, schemaFile),
    JSON.stringify(
      await genSchemasFromManifest(
        await import(manifest).then((mod) => mod.default),
      ),
      null,
      2,
    ),
  );

  console.log(`✔️ ready to rock and roll! Your project is live 🤘`);
};

const manifestFile = "./live.gen.ts";

export async function generate(
  directory: string,
  manifest: ManifestBuilder,
) {
  const proc = Deno.run({
    cmd: [Deno.execPath(), "fmt", "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "null",
  });
  const raw = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(manifest.build()));
      controller.close();
    },
  });
  await raw.pipeTo(proc.stdin.writable);
  const out = await proc.output();
  await proc.status();
  proc.close();

  const manifestStr = new TextDecoder().decode(out);
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
  const ns = await namespaceFromImportMap(dir);
  if (!ns) {
    return undefined;
  }
  const siteJSONPath = join(dir, siteJSON);
  let siteInfo: SiteInfo | null = null;
  if (await exists(siteJSONPath)) {
    siteInfo = await Deno.readTextFile(siteJSONPath).then(
      JSON.parse,
    );
  } else {
    siteInfo = {
      namespace: ns,
    };
  }
  if (siteInfo?.namespace !== ns) {
    await Deno.writeTextFile(
      siteJSONPath,
      JSON.stringify({ ...siteInfo, namespace: ns }, null, 2),
    );
  }
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
  await checkUpdates(dir).catch((err) =>
    console.log("error when checking updates", err)
  );
  const ns = await getAndUpdateNamespace(dir) ?? base;
  context.namespace = ns;
  ensureMinDenoVersion();

  entrypoint = new URL(entrypoint, base).href;

  let currentManifest: ManifestBuilder;
  const prevManifest = Deno.env.get("LIVE_DEV_PREVIOUS_MANIFEST");
  if (prevManifest) {
    currentManifest = newManifestBuilder(JSON.parse(prevManifest));
  } else {
    currentManifest = newManifestBuilder({
      namespace: ns,
      imports: {},
      manifest: {},
      exports: [],
    });
  }
  let manifest = await decoManifestBuilder(dir, ns);
  manifest = manifest.mergeWith(
    typeof imports === "object" ? Object.values(imports) : imports,
  );

  Deno.env.set("LIVE_DEV_PREVIOUS_MANIFEST", manifest.toJSONString());

  await setupGithooks();
  const manifestChanged = !currentManifest.equal(manifest);

  if (manifestChanged) {
    await generate(dir, manifest);
  }

  genSchemas(base, manifestFile, dir);

  onListen?.();

  await import(entrypoint);
}

export async function format(content: string) {
  const proc = Deno.run({
    cmd: [Deno.execPath(), "fmt", "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "null",
  });

  const raw = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(content));
      controller.close();
    },
  });
  await raw.pipeTo(proc.stdin.writable);
  const out = await proc.output();
  await proc.status();
  proc.close();

  return new TextDecoder().decode(out);
}

// Generate live own manifest data so that other sites can import native functions and sections.
export const liveNs = "$live";
if (import.meta.main) {
  context.namespace = liveNs;
  const dir = Deno.cwd();
  const newManifestData = await decoManifestBuilder(dir, liveNs);
  await generate(dir, newManifestData).then(() =>
    genSchemas(import.meta.url, manifestFile, dir)
  );
}
