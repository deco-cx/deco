// deno-lint-ignore-file no-explicit-any
import { Resolver } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { ASTNode, TsType } from "$live/engine/schema/ast.ts";
import {
  Schemeable,
  TransformContext,
} from "$live/engine/schema/transformv2.ts";
import {
  JSONSchema7,
  JSONSchema7Definition,
} from "https://esm.sh/v103/@types/json-schema@7.0.11/index.d.ts";
import { FreshContext } from "$live/engine/adapters/fresh/manifest.ts";
import {
  Import,
  ImportClause,
  ManifestBuilder,
  newManifestBuilder,
} from "./adapters/fresh/manifestBuilder.ts";
import { fromFileUrl } from "https://deno.land/std@0.170.0/path/mod.ts";

export type ModuleAST = [string, string, ASTNode[]];

export type Definitions = Record<string, JSONSchema7>;

export interface FunctionBlockDefinition {
  name: string;
  input: TsType | undefined | JSONSchema7;
  output: TsType | JSONSchema7;
}

export type BlockType = string;
export type ImportString = string;
export type BlockAlias = string;

export interface BlockDefinitions {
  imports: ImportString[];
  schemeables: Schemeable[];
}

export interface BlockBase {
  import: string;
  type: BlockType;
  defaultJSONSchemaDefinitions?: Record<string, JSONSchema7Definition>;
  findModuleDefinitions: (
    transformContext: TransformContext,
    ast: [string, ASTNode[]],
  ) => BlockDefinitions;
}

const blockTypeToImportClause = (
  blockAlias: string,
  imp: ImportString,
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

const withDefinition = (block: BlockType) =>
(
  man: ManifestBuilder,
  { schemeables, imports }: BlockDefinitions,
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
export interface DataBlock<TBlock = any> extends BlockBase {
  adapt: <TExtension extends TBlock>(
    block: (blk: TExtension, ctx: FreshContext) => PromiseOrValue<TExtension>,
  ) => Resolver<TExtension, TExtension, FreshContext>;
}

export interface FunctionBlock<
  TBlockDefinition = any,
  TIntermediate = TBlockDefinition,
> extends BlockBase {
  adapt: <TProps>(
    block: TBlockDefinition,
  ) => Resolver<TIntermediate, TProps, FreshContext>;
}

export const isFunctionBlock = (b: Block): b is FunctionBlock => {
  return (b as FunctionBlock).adapt !== undefined;
};

export type Block<
  TBlockDefinition = any,
  TIntermediate = TBlockDefinition,
> = TBlockDefinition extends (...args: any[]) => any
  ? FunctionBlock<TBlockDefinition, TIntermediate>
  : DataBlock<TBlockDefinition>;

export const buildingBlocks = (
  blocks: Block[],
  transformContext: TransformContext,
): ManifestBuilder => {
  const initialManifest = newManifestBuilder({
    imports: [],
    exports: [],
    manifest: {},
  });

  const code = Object.values(transformContext.code).map(
    (m) => [m[1], m[2]] as [string, ASTNode[]],
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
