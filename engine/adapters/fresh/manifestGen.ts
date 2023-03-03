import blocks from "$live/blocks/index.ts";
import {
  ManifestBuilder,
  newManifestBuilder,
} from "$live/engine/adapters/fresh/manifestBuilder.ts";
import {
  Block,
  BlockModuleRef,
  BlockType,
  ModuleAST,
} from "$live/engine/block.ts";
import { ASTNode } from "$live/engine/schema/ast.ts";
import { Schemeable, TransformContext } from "$live/engine/schema/transform.ts";
import { denoDoc } from "$live/engine/schema/utils.ts";
import { walk } from "https://deno.land/std@0.170.0/fs/walk.ts";
import { globToRegExp } from "https://deno.land/std@0.61.0/path/glob.ts";
import { join } from "https://deno.land/std@0.61.0/path/mod.ts";

const withDefinition = (block: BlockType, blockIdx: number) =>
(
  blkN: number,
  man: ManifestBuilder,
  { inputSchema, outputSchema, functionRef }: BlockModuleRef,
): ManifestBuilder => {
  const ref = `${"$".repeat(blockIdx)}${blkN}`;
  const inputSchemaId = inputSchema?.id ?? crypto.randomUUID();
  if (inputSchema) {
    man = man.addSchemeables({ ...inputSchema, id: inputSchemaId });
  }
  const hasWellKnownOutput = outputSchema && outputSchema.type !== "unknown";
  if (hasWellKnownOutput) {
    // TODO Add anyof com a funcao
    const outputId = outputSchema.id ?? crypto.randomUUID();
    man = man
      .addSchemeables({ ...outputSchema, id: outputId })
      .schemeableAnyOf(outputId, functionRef);
  }
  const functionSchema: Schemeable = {
    root: block,
    id: functionRef,
    type: "inline",
    value: {
      type: "object",
      allOf: inputSchema && inputSchemaId ? [{ $ref: inputSchemaId }] : [],
      required: ["__resolveType"],
      properties: {
        __resolveType: {
          const: functionRef,
        },
      },
    },
  };
  return man
    .addSchemeables(functionSchema)
    .addImports({
      from: functionRef,
      clauses: [{ alias: ref }],
    })
    .addValuesOnManifestKey(block, [
      functionRef,
      {
        kind: "js",
        raw: { identifier: ref },
      },
    ]);
};

const addDefinitions = async (
  blocks: Block[],
  transformContext: TransformContext,
): Promise<ManifestBuilder> => {
  const initialManifest = newManifestBuilder({
    imports: [],
    exports: [],
    manifest: {},
    schemas: {
      definitions: {},
      root: {},
    },
  });

  const code = Object.values(transformContext.code).map(
    (m) => [m[1], m[2]] as [string, ASTNode[]],
  );

  const blockDefinitions = await Promise.all(
    blocks.map((blk) =>
      Promise.all(code.map((c) => blk.introspect(transformContext, c[0], c[1])))
    ),
  );

  return blocks
    .reduce((manz, blk, i) => {
      const blkAlias = blk.type;
      const useDef = withDefinition(blkAlias, i + 1);
      let totalBlks = 0;
      return blockDefinitions[i].reduce((nMan, def) => {
        if (!def) {
          return nMan;
        }
        const n = useDef(totalBlks, nMan, def);
        totalBlks += 1;
        return n;
      }, manz);
    }, initialManifest)
    .addImports({
      from: "$live/engine/adapters/fresh/manifest.ts",
      clauses: [{ import: "configurable" }],
    })
    .addExportDefault({
      variable: { identifier: "configurable(manifest)" },
    });
};

export const decoManifestBuilder = async (
  dir: string,
): Promise<ManifestBuilder> => {
  const liveIgnore = join(dir, ".liveignore");
  const st = await Deno.stat(liveIgnore).catch((_) => ({ isFile: false }));
  const blocksDirs = blocks.map((blk) =>
    globToRegExp(join("**", blk.type, "**"), { globstar: true })
  );

  const ignoreGlobs = !st.isFile
    ? []
    : await Deno.readTextFile(liveIgnore).then((txt) => txt.split("\n"));

  const modulePromises: Promise<ModuleAST>[] = [];
  // TODO can be improved using a generator that adds the promise entry in the denoDoc cache and yeilds the path of the file
  // that way the blocks can analyze the AST before needing to fetch all modules first.
  for await (
    const entry of walk(dir, {
      includeDirs: false,
      includeFiles: true,
      exts: ["tsx", "jsx", "ts", "js"],
      match: blocksDirs,
      skip: ignoreGlobs.map((glob) => globToRegExp(glob, { globstar: true })),
    })
  ) {
    modulePromises.push(
      denoDoc(entry.path)
        .then(
          (doc) => [dir, entry.path.substring(dir.length), doc] as ModuleAST,
        )
        .catch((_) => [dir, entry.path.substring(dir.length), []]),
    );
  }

  const modules = await Promise.all(modulePromises);
  const transformContext = modules.reduce(
    (ctx, module) => {
      const ast = [module[0], `.${module[1]}`, module[2]] as ModuleAST;
      return {
        ...ctx,
        code: {
          ...ctx.code,
          [join(ctx.base, module[1])]: ast,
        },
      };
    },
    { base: dir, code: {} },
  );

  return addDefinitions(blocks, {
    ...transformContext,
    denoDoc: async (src) => {
      return (
        (transformContext.code as Record<string, ModuleAST>)[src] ??
          ([src, src, await denoDoc(src)] as ModuleAST)
      );
    },
  });
};
