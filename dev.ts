import os from "https://deno.land/x/dos@v0.11.0/mod.ts";
import { setupGithooks } from "https://deno.land/x/githooks@0.0.3/githooks.ts";
import { dirname, fromFileUrl, join } from "std/path/mod.ts";
import { gte } from "std/semver/mod.ts";

import { DecoManifest } from "$live/engine/adapters/fresh/manifest.ts";
import {
  ManifestBuilder,
  newManifestBuilder,
} from "$live/engine/adapters/fresh/manifestBuilder.ts";
import { decoManifestBuilder } from "$live/engine/adapters/fresh/manifestGen.ts";
import { ResolverMap } from "$live/engine/core/resolver.ts";
import { error } from "$live/error.ts";

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

    error(message);
  }
}

interface Manifest {
  routes: string[];
  islands: string[];
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

const withImport = (
  blk: string,
  pathBase: (imp: string) => [string, string],
  prefix: string,
  adapt?: string,
  importDefault?: boolean,
) =>
(m: ManifestBuilder, imp: string, i: number) => {
  const alias = `${prefix}${i}`;
  const [from, key] = pathBase(imp);
  const variable = importDefault ? `${alias}.default` : alias;
  return m
    .addImports({
      from,
      clauses: [{ alias: alias }],
    })
    .addValuesOnManifestKey(blk, [
      key,
      {
        kind: "js",
        raw: { identifier: adapt ? `${adapt}(${variable})` : alias },
      },
    ]);
};
export default async function dev(
  base: string,
  entrypoint: string,
  {
    imports = {},
    onListen,
  }: {
    imports?: Record<
      string,
      DecoManifest | (DecoManifest & Partial<Record<string, ResolverMap>>)
    >;
    onListen?: () => void;
  } = {},
) {
  ensureMinDenoVersion();

  entrypoint = new URL(entrypoint, base).href;

  const dir = dirname(fromFileUrl(base));

  let currentManifest: ManifestBuilder;
  const prevManifest = Deno.env.get("LIVE_DEV_PREVIOUS_MANIFEST");
  if (prevManifest) {
    currentManifest = newManifestBuilder(JSON.parse(prevManifest));
  } else {
    currentManifest = newManifestBuilder({
      imports: [],
      manifest: {},
      exports: [],
      schemas: {
        root: {},
        definitions: {},
      },
    });
  }
  let manifest = await decoManifestBuilder(dir);
  // "imports" is of format { "nameOfImport" : manifest }
  // for (const [key, importManifest] of Object.entries(imports || {})) {
  //   for (const blk of blocks) {
  //     const blkFns =
  //       (importManifest as Record<string, ResolverMap>)[blk.type] ?? {};
  //     const isRoutes = blk.type === "routes";
  //     const blockKeys = Object.keys(blkFns);
  //     manifest = blockKeys.reduce(
  //       withImport(
  //         blk.type,
  //         (imp) =>
  //           [
  //             imp.replace(`./`, `${key}/`),
  //             !isRoutes ? imp.replace(`./`, `${key}/`) : imp,
  //           ] as [string, string],
  //         `$${key}${blk.type}`,
  //         `${blk.type}.default.adapt`,
  //         !isRoutes
  //       ),
  //       manifest
  //     );
  //   }

  //   const importDef = Object.keys(importManifest.definitions ?? {}).reduce(
  //     (acc: Record<string, unknown>, val) => {
  //       acc[val.replace("./", `${key}/`)] = (importManifest.definitions ?? {})[
  //         val
  //       ];
  //       return acc;
  //     },
  //     {}
  //   );
  //   manifest = manifest.withDefinitions(importDef);
  // }

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
if (import.meta.main) {
  const dir = Deno.cwd();
  const newManifestData = await decoManifestBuilder(dir);
  await generate(dir, newManifestData);
}
