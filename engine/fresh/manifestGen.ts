import { join } from "https://deno.land/std@0.61.0/path/mod.ts";
import { walk, WalkEntry } from "std/fs/walk.ts";
import blocks from "$live/blocks/index.ts";
import { Block, BlockType } from "../../engine/block.ts";
import { shouldBeLocal } from "../../blocks/appsUtil.ts";
import {
  ManifestBuilder,
  newManifestBuilder,
} from "../../engine/fresh/manifestBuilder.ts";
import { exists, fileSeparatorToSlash } from "../../utils/filesystem.ts";

const withDefinition = (
  man: ManifestBuilder,
  namespace: string,
  funcImportPath: string,
  block: BlockType,
  blockIdx: number,
  blkN: number,
): ManifestBuilder => {
  const functionRef = fileSeparatorToSlash(funcImportPath);
  const functionKey = shouldBeLocal(block, functionRef)
    ? functionRef
    : `${namespace}${functionRef.substring(1)}`; // add namespace to the functionRef

  const ref = `${"$".repeat(blockIdx)}${blkN}`;
  return man
    .addImports({
      from: functionRef,
      clauses: [{ alias: ref }],
    })
    .addValuesOnManifestKey(block, [
      functionKey,
      {
        kind: "js",
        raw: { identifier: ref },
      },
    ]);
};

export const defaultRoutes: {
  key: string;
  ref: string;
  block: string;
  from: string;
}[] = [
  {
    block: "routes",
    from: "$live/routes/live/workflows/run.ts",
    key: "./routes/live/workflows/run.ts",
    ref: "$live_workflows",
  },
  {
    block: "routes",
    from: "$live/routes/_middleware.ts",
    key: "./routes/_middleware.ts",
    ref: "$live_middleware",
  },
  {
    block: "routes",
    from: "$live/routes/live/workbench.ts",
    key: "./routes/live/workbench.ts",
    ref: "$live_workbench",
  },
  {
    block: "routes",
    from: "$live/routes/live/invoke/index.ts",
    key: "./routes/live/invoke/index.ts",
    ref: "$live_invoke",
  },
  {
    block: "routes",
    from: "$live/routes/live/invoke/[...key].ts",
    key: "./routes/live/invoke/[...key].ts",
    ref: "$live_invoke_key",
  },
  {
    block: "routes",
    from: "$live/routes/live/editorData.ts",
    key: "./routes/live/editorData.ts",
    ref: "$live_editorData",
  },
  {
    block: "routes",
    from: "$live/routes/live/inspect/[...block].ts",
    key: "./routes/live/inspect/[...block].ts",
    ref: "$live_inspect",
  },
  {
    block: "routes",
    from: "$live/routes/live/release.ts",
    key: "./routes/live/release.ts",
    ref: "$live_release",
  },
  {
    block: "routes",
    from: "$live/routes/live/_meta.ts",
    key: "./routes/live/_meta.ts",
    ref: "$live_meta",
  },
  {
    block: "routes",
    from: "$live/routes/live/previews/[...block].tsx",
    key: "./routes/live/previews/[...block].tsx",
    ref: "$live_previews_block",
  },
  {
    block: "routes",
    from: "$live/routes/live/previews/index.tsx",
    key: "./routes/live/previews/index.tsx",
    ref: "$live_previews_index",
  },
  {
    block: "routes",
    from: "$live/routes/[...catchall].tsx",
    key: "./routes/index.tsx",
    ref: "$live_catchall",
  },
  {
    block: "routes",
    from: "$live/routes/[...catchall].tsx",
    key: "./routes/[...catchall].tsx",
    ref: "$live_catchall",
  },
];
const defaultLiveRoutes = (man: ManifestBuilder): ManifestBuilder => {
  return defaultRoutes.reduce((m, { key, ref, block, from }) => {
    const blockObj = m.data.manifest[block];
    if (
      blockObj?.kind === "obj" &&
      blockObj.value[key]
    ) {
      console.warn(
        `%cwarn%c: the live ${block} ${key} was overwritten.`,
        "color: yellow; font-weight: bold",
        "",
      );

      return m;
    }
    return m
      .addImports({
        from,
        clauses: [{ alias: ref }],
      })
      .addValuesOnManifestKey(block, [
        key,
        {
          kind: "js",
          raw: { identifier: ref },
        },
      ]);
  }, man);
};

export async function* listBlocks(
  base: string,
  blk: Block,
): AsyncGenerator<WalkEntry> {
  const dir = join(base, blk.type);
  if (!(await exists(dir))) {
    return;
  }
  for await (
    const entry of walk(dir, {
      includeDirs: false,
      includeFiles: true,
      exts: ["tsx", "jsx", "ts", "js"],
    })
  ) {
    yield entry;
  }
}

const localBlocks: Record<string, boolean> = {
  routes: true,
  islands: true,
};
const appsBlocks = (blk: Block) => localBlocks[blk.type] !== true;

export interface ManifestOpts {
  appMode?: boolean;
  injectRoutes?: boolean;
}

export const decoManifestBuilder = async (
  dir: string,
  namespace: string,
  { appMode, injectRoutes }: ManifestOpts = {
    appMode: false,
    injectRoutes: true,
  },
): Promise<ManifestBuilder> => {
  let initialManifest = newManifestBuilder({
    namespace,
    imports: {},
    exports: [],
    manifest: {},
    appMode,
  });
  let blockIdx = 1;
  for (const blk of (appMode ? blocks.filter(appsBlocks) : blocks)) {
    let totalBlocks = 0;
    for await (
      const entry of listBlocks(dir, blk)
    ) {
      // ignore file name with __NAME__.ts
      if (
        entry.name.startsWith("__") &&
        (entry.name.endsWith("__.ts") || entry.name.endsWith("__.tsx"))
      ) {
        continue;
      }
      initialManifest = withDefinition(
        initialManifest,
        namespace,
        entry.path.replace(dir, "."),
        blk.type,
        blockIdx,
        totalBlocks++,
      );
    }
    blockIdx++;
  }

  const [appManifest, manifestType] = !appMode
    ? [
      (injectRoutes
        ? defaultLiveRoutes(
          initialManifest,
        )
        : initialManifest).addImports({
          from: "$live/types.ts",
          clauses: [{ import: "DecoManifest" }],
        }),
      "DecoManifest",
    ]
    : [
      initialManifest,
      undefined,
    ];
  return appManifest.addManifestValues(["name", { kind: "js", raw: namespace }])
    .addExportDefault({
      variable: { identifier: "manifest", satisfies: manifestType },
    });
};
