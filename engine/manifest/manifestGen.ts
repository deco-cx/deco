import { walk } from "@std/fs/walk";
import { join } from "@std/path";
import { shouldBeLocal } from "../../blocks/appsUtil.ts";
import blocks from "../../blocks/index.ts";
import { exists, fileSeparatorToSlash } from "../../utils/filesystem.ts";
import type { BlockType } from "../block.ts";
import { safeImportResolve } from "../importmap/builder.ts";
import { type ManifestBuilder, newManifestBuilder } from "./manifestBuilder.ts";
const sanitize = (functionName: string) =>
  functionName.startsWith("/") ? functionName : `/${functionName}`;
const withDefinition = (
  man: ManifestBuilder,
  namespace: string,
  funcImportPath: string,
  block: BlockType,
  blockIdx: number,
  blkN: number,
): ManifestBuilder => {
  const _functionRef = fileSeparatorToSlash(funcImportPath);
  const functionRef = _functionRef.startsWith(".")
    ? _functionRef
    : `.${sanitize(_functionRef)}`;
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
      return safeImportResolve(impl);
    } catch {
      return undefined;
    }
  })!;

export interface TsWalkerEntry {
  name: string;
  path: string;
}
export type TsWalker = (dir: string) => AsyncIterableIterator<TsWalkerEntry>;

export async function* defaultWalker(
  dir: string,
): AsyncIterableIterator<TsWalkerEntry> {
  if (!(await exists(dir))) {
    return;
  }
  return yield* walk(dir, {
    includeDirs: false,
    includeFiles: true,
    exts: ["tsx", "jsx", "ts", "js"],
  });
}
export const decoManifestBuilder = async (
  dir: string,
  namespace: string,
  walker: TsWalker = defaultWalker,
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
    const blockDir = join(dir, blk.type);

    // for stability purposes we need to sort paths first.
    const paths: string[] = [];
    for await (
      const entry of walker(blockDir)
    ) {
      // ignore file name with __NAME__.ts
      if (
        entry.name.startsWith("__") &&
        (entry.name.endsWith("__.ts") || entry.name.endsWith("__.tsx"))
      ) {
        continue;
      }
      paths.push(entry.path);
    }

    for (const path of paths.sort()) {
      initialManifest = withDefinition(
        initialManifest,
        namespace,
        dir !== "" ? path.replace(dir, ".") : path,
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
