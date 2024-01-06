import { join } from "https://deno.land/std@0.61.0/path/mod.ts";
import { walk, WalkEntry } from "std/fs/walk.ts";
import { shouldBeLocal } from "../../blocks/appsUtil.ts";
import blocks from "../../blocks/index.ts";
import { Block, BlockType } from "../../engine/block.ts";
import {
  ManifestBuilder,
  newManifestBuilder,
} from "../../engine/manifest/manifestBuilder.ts";
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

export const resolveAny = (importString: string[]): string =>
  importString.find((impl) => {
    try {
      return import.meta.resolve(impl);
    } catch {
      return undefined;
    }
  })!;

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

export const decoManifestBuilder = async (
  dir: string,
  namespace: string,
): Promise<ManifestBuilder> => {
  let initialManifest = newManifestBuilder({
    namespace,
    imports: {},
    exports: [],
    manifest: {},
  });
  let blockIdx = 1;
  for (const blk of blocks()) {
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

  return initialManifest.addManifestValues(["name", {
    kind: "js",
    raw: namespace,
  }])
    .addExportDefault({
      variable: { identifier: "manifest" },
    });
};
