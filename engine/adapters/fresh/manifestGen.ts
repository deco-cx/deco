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
import { denoDoc } from "$live/engine/schema/transform.ts";
import { TransformContext } from "$live/engine/schema/transformv2.ts";
import { walk } from "https://deno.land/std@0.170.0/fs/walk.ts";
import { globToRegExp } from "https://deno.land/std@0.61.0/path/glob.ts";
import { fromFileUrl, join } from "https://deno.land/std@0.61.0/path/mod.ts";

const blockTypeToImportClause = (
  blockAlias: string,
  imp: ImportString
): [Import, string] => {
  const [from, name] = imp.split("@");
  const [clause, ref]: [ImportClause, string] =
    name === "" || name === undefined
      ? [{ alias: blockAlias }, `${blockAlias}.default`]
      : [
          { import: name, as: `${blockAlias}$${name}` },
          `${blockAlias}$${name}`,
        ];
  return [{ from, clauses: [clause] }, ref];
};

const withDefinition =
  (block: BlockType) =>
  (
    man: ManifestBuilder,
    { schemeables, imports }: BlockDefinitions
  ): ManifestBuilder => {
    return imports.reduce((manz, imp, i) => {
      const fAlias = `$${block}${i}`;
      const [importClause, ref] = blockTypeToImportClause(fAlias, imp);
      return manz.addImports(importClause).addValuesOnManifestKey(`${block}s`, [
        imp,
        {
          kind: "js",
          raw: {
            identifier: `${block}.default.adapt`,
            params: [
              {
                kind: "js",
                raw: { identifier: ref },
              },
            ],
          },
        },
      ]);
    }, man.addSchemeables(...schemeables));
  };

const addDefinitions = (
  blocks: Block[],
  transformContext: TransformContext
): ManifestBuilder => {
  const initialManifest = newManifestBuilder({
    imports: [],
    exports: [],
    manifest: {},
    manifestDef: {},
  });

  const code = Object.values(transformContext.code).map(
    (m) => [m[1], m[2]] as [string, ASTNode[]]
  );
  return blocks
    .reduce((manz, blk) => {
      const blkAlias = blk.type;
      const man = manz.addImports({
        from: fromFileUrl(blk.import).replace(transformContext.base, "."),
        clauses: [{ alias: blkAlias }],
      });
      const useDef = withDefinition(blkAlias);
      return code.reduce((nMan, code) => {
        return useDef(nMan, blk.findModuleDefinitions(transformContext, code));
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
  blocks: Block[]
): Promise<ManifestBuilder> => {
  const liveIgnore = join(dir, ".liveignore");
  const st = await Deno.stat(liveIgnore).catch((_) => ({ isFile: false }));

  const ignoreGlobs = !st.isFile
    ? []
    : await Deno.readTextFile(liveIgnore).then((txt) => txt.split("\n"));

  const modulePromises: Promise<ModuleAST>[] = [];
  for await (const entry of walk(dir, {
    includeDirs: false,
    includeFiles: true,
    exts: ["tsx", "jsx", "ts", "js"],
    skip: ignoreGlobs.map((glob) => globToRegExp(glob, { globstar: true })),
  })) {
    modulePromises.push(
      denoDoc(entry.path).then((doc) => [
        dir,
        entry.path.substring(dir.length),
        doc,
      ])
    );
  }

  const modules = await Promise.all(modulePromises);
  const transformContext = modules.reduce(
    (ctx, module) => {
      return {
        ...ctx,
        code: {
          ...ctx.code,
          [join(ctx.base, module[1])]: [module[0], `.${module[1]}`, module[2]],
        },
      };
    },
    { base: dir, code: {} }
  );

  return addDefinitions(blocks, transformContext);
};
