import {
  Import,
  ImportClause,
  ManifestBuilder,
  newManifestBuilder,
} from "$live/engine/adapters/fresh/manifestBuilder.ts";
import {
  Block,
  BlockDefinitions,
  BlockType,
  ImportString,
  ModuleAST,
} from "$live/engine/block.ts";
import { ASTNode } from "$live/engine/schema/ast.ts";
import { denoDoc } from "$live/engine/schema/utils.ts";
import { TransformContext } from "$live/engine/schema/transform.ts";
import { walk } from "https://deno.land/std@0.170.0/fs/walk.ts";
import { globToRegExp } from "https://deno.land/std@0.61.0/path/glob.ts";
import { fromFileUrl, join } from "https://deno.land/std@0.61.0/path/mod.ts";

const blockTypeToImportClause = (
  blockAlias: string,
  imp: ImportString,
): [string, Import, string] => {
  const [from, name] = imp.split("@");
  if (name === "$") {
    // if $ is used as name it means that the import clause is the default one (in other words: does not need to access .default)
    return [from, { from, clauses: [{ alias: blockAlias }] }, blockAlias];
  }
  const [clause, ref]: [ImportClause, string] =
    name === "" || name === undefined
      ? [{ alias: blockAlias }, `${blockAlias}.default`]
      : [
        { import: name, as: `${blockAlias}$${name}` },
        `${blockAlias}$${name}`,
      ];
  return [imp, { from, clauses: [clause] }, ref];
};

const withDefinition = (block: BlockType, adapt: boolean) =>
(
  blkN: number,
  man: ManifestBuilder,
  { schemeables, imports }: BlockDefinitions,
): ManifestBuilder => {
  return imports.reduce((manz, imp, i) => {
    const fAlias = `$${block}${blkN + i}`;
    const [importKey, importClause, ref] = blockTypeToImportClause(
      fAlias,
      imp,
    );
    const blockRef = {
      kind: "js",
      raw: { identifier: ref },
    };
    return manz.addImports(importClause).addValuesOnManifestKey(`${block}s`, [
      importKey,
      {
        kind: "js",
        raw: adapt
          ? {
            identifier: `${block}.default.adapt`,
            params: [blockRef],
          }
          : blockRef,
      },
    ]);
  }, man.addSchemeables(...schemeables));
};

const addDefinitions = async (
  blocks: Block[],
  transformContext: TransformContext,
): Promise<ManifestBuilder> => {
  const initialManifest = newManifestBuilder({
    imports: [],
    exports: [],
    manifest: {},
    manifestDef: blocks.reduce((def, blk) => {
      return { ...def, ...blk.defaultJSONSchemaDefinitions };
    }, {}),
  });

  const code = Object.values(transformContext.code).map(
    (m) => [m[1], m[2]] as [string, ASTNode[]],
  );

  const blockDefinitions = await Promise.all(
    blocks.map((blk) =>
      Promise.all(
        code.map((c) => blk.findModuleDefinitions(transformContext, c)),
      )
    ),
  );

  return blocks
    .reduce((manz, blk, i) => {
      const blkAlias = blk.type;
      const man = manz.addImports({
        from: (blk.import.startsWith("file://")
          ? fromFileUrl(blk.import)
          : blk.import).replace(transformContext.base, "."),
        clauses: [{ alias: blkAlias }],
      });
      const useDef = withDefinition(
        blkAlias,
        (blk as { adapt: unknown }).adapt !== undefined,
      );
      let totalBlks = 0;
      return blockDefinitions[i].reduce((nMan, def) => {
        const n = useDef(totalBlks, nMan, def);
        totalBlks += def.imports.length;
        return n;
      }, man);
    }, initialManifest)
    .addImports({
      from: "$live/engine/adapters/fresh/manifest.ts",
      clauses: [{ import: "configurable" }],
    })
    .addExportDefault({ variable: { identifier: "configurable(manifest)" } });
};

export const decoManifestBuilder = async (
  dir: string,
  blocks: Block[],
): Promise<ManifestBuilder> => {
  const liveIgnore = join(dir, ".liveignore");
  const st = await Deno.stat(liveIgnore).catch((_) => ({ isFile: false }));

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
