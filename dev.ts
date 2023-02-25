import os from "https://deno.land/x/dos@v0.11.0/mod.ts";
import { setupGithooks } from "https://deno.land/x/githooks@0.0.3/githooks.ts";
import { walk } from "std/fs/walk.ts";
import {
  dirname,
  extname,
  fromFileUrl,
  join,
  toFileUrl,
} from "std/path/mod.ts";
import { gte } from "std/semver/mod.ts";

import accountBlock from "$live/blocks/account.ts";
import loaderBlock from "$live/blocks/loader.ts";
import pageBlock from "$live/blocks/page.ts";
import sectionBlock from "$live/blocks/section.ts";
import { DecoManifest } from "$live/engine/adapters/fresh/manifest.ts";
import {
  ManifestBuilder,
  newManifestBuilder,
} from "$live/engine/adapters/fresh/manifestBuilder.ts";
import { decoManifestBuilder } from "$live/engine/adapters/fresh/manifestGen.ts";
import { error } from "$live/error.ts";
import { ResolverMap } from "./engine/core/resolver.ts";

const defaultBlocks = [accountBlock, sectionBlock, loaderBlock, pageBlock];

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

export async function collect(directory: string): Promise<Manifest> {
  const routesDir = join(directory, "./routes");
  const islandsDir = join(directory, "./islands");

  const routes = [];
  try {
    const routesUrl = toFileUrl(routesDir);
    // TODO(lucacasonato): remove the extranious Deno.readDir when
    // https://github.com/denoland/deno_std/issues/1310 is fixed.
    for await (const _ of Deno.readDir(routesDir)) {
      // do nothing
    }
    const routesFolder = walk(routesDir, {
      includeDirs: false,
      includeFiles: true,
      exts: ["tsx", "jsx", "ts", "js"],
    });
    for await (const entry of routesFolder) {
      if (entry.isFile) {
        const file = toFileUrl(entry.path).href.substring(
          routesUrl.href.length,
        );
        routes.push(file);
      }
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // Do nothing.
    } else {
      throw err;
    }
  }
  routes.sort();

  const islands = [];
  try {
    const islandsUrl = toFileUrl(islandsDir);
    for await (const entry of Deno.readDir(islandsDir)) {
      if (entry.isDirectory) {
        error(
          `Found subdirectory '${entry.name}' in islands/. The islands/ folder must not contain any subdirectories.`,
        );
      }
      if (entry.isFile) {
        const ext = extname(entry.name);
        if (![".tsx", ".jsx", ".ts", ".js"].includes(ext)) continue;
        const path = join(islandsDir, entry.name);
        const file = toFileUrl(path).href.substring(islandsUrl.href.length);
        islands.push(file);
      }
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // Do nothing.
    } else {
      throw err;
    }
  }
  islands.sort();

  return { routes, islands };
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

const withImport =
  (blk: string, pathBase: string, prefix: string) =>
  (m: ManifestBuilder, imp: string, i: number) => {
    const alias = `${prefix}${i}`;
    const from = `${pathBase}${imp}`;
    return m
      .addImports({
        from,
        clauses: [{ alias: alias }],
      })
      .addValuesOnManifestKey(blk, [
        from,
        { kind: "js", raw: { identifier: alias } },
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
      DecoManifest & Partial<Record<string, ResolverMap>>
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
      manifestDef: {},
    });
  }
  const newManifest = await collect(dir);

  let manifest = await decoManifestBuilder(dir, defaultBlocks);
  // "imports" is of format { "nameOfImport" : manifest }
  for (const [key, importManifest] of Object.entries(imports || {})) {
    for (const blk of defaultBlocks) {
      const blockCollection = `${blk.type}s`;
      const blkFns = importManifest[blockCollection] ?? {};
      const importFunctionNames = Object.keys(blkFns).map((name) =>
        name.replace(`./`, `${key}/`)
      );
      manifest = importFunctionNames.reduce(
        withImport(blockCollection, "", `$${key}${blk.type}`),
        manifest,
      );
    }

    const importDef = Object.keys(importManifest.definitions ?? {}).reduce(
      (acc: Record<string, unknown>, val) => {
        acc[val.replace("./", `${key}/`)] = (importManifest.definitions ?? {})[
          val
        ];
        return acc;
      },
      {},
    );
    manifest = manifest.withDefinitions(importDef);
  }

  const withRoutesMan = newManifest.routes.reduce(
    withImport("routes", "./routes", "$"),
    manifest,
  );

  const withIslandsMan = newManifest.islands.reduce(
    withImport("islands", "./islands", "$$"),
    withRoutesMan,
  );

  Deno.env.set("LIVE_DEV_PREVIOUS_MANIFEST", withIslandsMan.toJSONString());

  const manifestChanged = !currentManifest.equal(withIslandsMan);

  if (manifestChanged) await generate(dir, withIslandsMan);

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
  const newManifestData = await decoManifestBuilder(dir, defaultBlocks);
  await generate(dir, newManifestData);
}
