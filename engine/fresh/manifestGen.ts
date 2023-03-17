import blocks from "$live/blocks/index.ts";
import {
  Block,
  BlockModuleRef,
  BlockType,
  ModuleAST,
} from "$live/engine/block.ts";
import {
  ManifestBuilder,
  newManifestBuilder,
} from "$live/engine/fresh/manifestBuilder.ts";
import { ASTNode } from "$live/engine/schema/ast.ts";
import { TransformContext } from "$live/engine/schema/transform.ts";
import { denoDoc } from "$live/engine/schema/utils.ts";
import { walk } from "std/fs/walk.ts";
import { globToRegExp } from "https://deno.land/std@0.61.0/path/glob.ts";
import { join } from "https://deno.land/std@0.61.0/path/mod.ts";

const withDefinition =
  (block: BlockType, blockIdx: number, namespace: string) =>
  (
    blkN: number,
    man: ManifestBuilder,
    { inputSchema, outputSchema, functionRef }: BlockModuleRef
  ): ManifestBuilder => {
    const functionKey =
      block === "routes" || block === "islands" // islands and blocks are unique
        ? functionRef
        : `${namespace}${functionRef.substring(1)}`;
    const ref = `${"$".repeat(blockIdx)}${blkN}`;
    return man
      .withBlockSchema({
        inputSchema,
        outputSchema,
        functionKey,
        blockType: block,
      })
      .addImports({
        from: functionKey,
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

const defaultRoutes: { from: string; ref: string }[] = [
  {
    from: "routes/[...catchall].tsx",
    ref: "$live_catchall",
  },
  {
    from: "routes/live/previews/[...block].tsx",
    ref: "$live_previews",
  },
];
const addDefaultRoutes = (man: ManifestBuilder): ManifestBuilder => {
  const routesObj = man.data.manifest["routes"];
  if (
    routesObj?.kind === "obj" &&
    routesObj.value["./routes/[...catchall].tsx"]
  ) {
    console.warn(
      `%cwarn%c: the live entrypoint ./routes/[...catchall].tsx was overwritten.`,
      "color: yellow; font-weight: bold",
      ""
    );

    return man;
  }
  return defaultRoutes.reduce((m, { from, ref }) => {
    return m
      .addImports({
        from: `$live/${from}`,
        clauses: [{ alias: ref }],
      })
      .addValuesOnManifestKey("routes", [
        `./${from}`,
        {
          kind: "js",
          raw: { identifier: ref },
        },
      ]);
  }, man);
};
const addDefinitions = async (
  blocks: Block[],
  transformContext: TransformContext
): Promise<ManifestBuilder> => {
  const initialManifest = newManifestBuilder({
    namespace: transformContext.namespace,
    base: transformContext.base,
    imports: {},
    exports: [],
    manifest: {},
    schemaData: {
      blockModules: [],
      entrypoints: [],
      schema: {
        definitions: {},
        root: {},
      },
    },
  });

  const code = Object.values(transformContext.code).map(
    (m) => [m[1], m[2]] as [string, ASTNode[]]
  );

  const blockDefinitions = await Promise.all(
    blocks.map((blk) =>
      Promise.all(code.map((c) => blk.introspect(transformContext, c[0], c[1])))
    )
  );

  return blocks
    .reduce((manz, blk, i) => {
      const blkAlias = blk.type;
      const useDef = withDefinition(
        blkAlias,
        i + 1,
        transformContext.namespace
      );
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
      from: "$live/engine/fresh/manifest.ts",
      clauses: [{ import: "configurable" }],
    })
    .addExportDefault({
      variable: { identifier: "configurable(manifest)" },
    });
};

export const decoManifestBuilder = async (
  dir: string,
  namespace: string
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
  for await (const entry of walk(dir, {
    includeDirs: false,
    includeFiles: true,
    exts: ["tsx", "jsx", "ts", "js"],
    match: blocksDirs,
    skip: ignoreGlobs.map((glob) => globToRegExp(glob, { globstar: true })),
  })) {
    modulePromises.push(
      denoDoc(entry.path)
        .then(
          (doc) => [dir, entry.path.substring(dir.length), doc] as ModuleAST
        )
        .catch((_) => [dir, entry.path.substring(dir.length), []])
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
    { base: dir, code: {}, namespace }
  );

  return addDefinitions(blocks, transformContext).then(addDefaultRoutes);
};
