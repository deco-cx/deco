import os from "https://deno.land/x/dos@v0.11.0/mod.ts";
import { setupGithooks } from "https://deno.land/x/githooks@0.0.3/githooks.ts";
import { dirname, fromFileUrl, join } from "std/path/mod.ts";
import { gte } from "std/semver/mod.ts";

import { ResolverMap } from "$live/engine/core/resolver.ts";
import {
  ManifestBuilder,
  newManifestBuilder,
} from "$live/engine/fresh/manifestBuilder.ts";
import { decoManifestBuilder } from "$live/engine/fresh/manifestGen.ts";
import $ from "https://deno.land/x/dax@0.28.0/mod.ts";
import { DecoManifest } from "$live/types.ts";
import { context } from "$live/live.ts";

const MIN_DENO_VERSION = "1.25.0";

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

export async function generate(directory: string, manifest: ManifestBuilder) {
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

  const manifestPath = join(directory, "./live.gen.ts");

  await Deno.writeTextFile(manifestPath, manifestStr);
  console.log(
    `%cThe manifest has been generated.`,
    "color: blue; font-weight: bold",
  );
}

const namespaceFromGit = async (): Promise<string | undefined> => {
  const lns = await $`git remote show origin -n`.lines();
  if (lns.length < 1) {
    return undefined;
  }
  const fetchUrlLine = lns[1];
  const [_ignoreFetchUrl, _ignoreGitUrl, namespace] = fetchUrlLine.split(":");
  return namespace.trimEnd();
};
export default async function dev(
  base: string,
  entrypoint: string,
  {
    namespace = undefined,
    imports = [],
    siteId = undefined,
    onListen,
  }: {
    namespace?: string;
    imports?: Array<
      DecoManifest | (DecoManifest & Partial<Record<string, ResolverMap>>)
    >;
    siteId?: number;
    onListen?: () => void;
  } = {},
) {
  const ns = namespace ?? (await namespaceFromGit()) ?? base;
  context.namespace = ns;
  ensureMinDenoVersion();

  entrypoint = new URL(entrypoint, base).href;

  const dir = dirname(fromFileUrl(base));

  let currentManifest: ManifestBuilder;
  const prevManifest = Deno.env.get("LIVE_DEV_PREVIOUS_MANIFEST");
  if (prevManifest) {
    currentManifest = newManifestBuilder(JSON.parse(prevManifest));
  } else {
    currentManifest = newManifestBuilder({
      siteId,
      namespace: ns,
      imports: {},
      manifest: {},
      exports: [],
    });
  }
  let manifest = await decoManifestBuilder(dir, ns, siteId);
  manifest = manifest.mergeWith(imports);

  Deno.env.set("LIVE_DEV_PREVIOUS_MANIFEST", manifest.toJSONString());

  const manifestChanged = !currentManifest.equal(manifest);

  if (manifestChanged) await generate(dir, manifest);

  const shouldSetupGithooks = os.platform() !== "windows";

  if (shouldSetupGithooks) {
    await setupGithooks();
  }

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
  const dir = Deno.cwd();
  const newManifestData = await decoManifestBuilder(dir, liveNs);
  await generate(dir, newManifestData);
}
