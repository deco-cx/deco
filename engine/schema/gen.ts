import { toFileUrl } from "std/path/mod.ts";
import { AppManifest, ImportMap } from "../../blocks/app.ts";
import { withoutLocalModules } from "../../blocks/appsUtil.ts";
import blocks from "../../blocks/index.ts";
import { JSONSchema7 } from "../../deps.ts";
import { Block, BlockModuleRef } from "../block.ts";
import { ImportMapBuilder, ImportMapResolver } from "../importmap/builder.ts";
import {
  BlockModule,
  EntrypointModule,
  newSchemaBuilder,
  Schemas,
} from "./builder.ts";
import { parsePath } from "./parser.ts";
import { programToBlockRef, ReferenceKey, Schemeable } from "./transform.ts";

export const namespaceOf = (blkType: string, blkKey: string): string => {
  return blkKey.substring(0, blkKey.indexOf(blkType) - 1);
};

const resolveForPath = async (
  introspect: Block["introspect"],
  importMapResolver: ImportMapResolver,
  baseDir: string,
  blockKey: string,
  references: Map<ReferenceKey, Schemeable>,
): Promise<BlockModuleRef | undefined> => {
  const blockPath = importMapResolver.resolve(blockKey, baseDir) ??
    resolveImport(blockKey);
  if (!blockPath) {
    return undefined;
  }
  const program = await parsePath(blockPath);
  if (!program) {
    return undefined;
  }
  return programToBlockRef(
    importMapResolver,
    blockPath,
    blockKey,
    program,
    references,
    introspect,
  );
};

const resolveImport = (path: string) => {
  try {
    return import.meta.resolve(path);
  } catch (err) {
    if (path.startsWith("$live")) {
      return import.meta.resolve(path.replace("$live", "deco"));
    }
    throw err;
  }
};

export const genSchemasFromManifest = async (
  manifest: AppManifest,
  baseDir?: string,
  importMap: ImportMap = { imports: {} },
): Promise<Schemas> => {
  const { baseUrl: _ignore, name: _ignoreName, ...manifestBlocks } = manifest;
  const dir = toFileUrl(baseDir ? baseDir : Deno.cwd()).toString();
  const importMapResolver = ImportMapBuilder.new().mergeWith(importMap, dir);

  const rootWithBlocks: Record<string, JSONSchema7> = blocks().reduce(
    (root, blk) => {
      root[blk.type] = {
        title: blk.type,
        anyOf: [],
      };
      return root;
    },
    {} as Record<string, JSONSchema7>,
  );
  const schemaBuilder = newSchemaBuilder({
    schema: { root: rootWithBlocks, definitions: {} },
    blockModules: [],
    entrypoints: [],
  });

  const refPromises: Promise<
    (BlockModule | EntrypointModule | undefined)
  >[] = [];
  const references = new Map<ReferenceKey, Schemeable>();
  for (const block of blocks()) {
    for (
      const blockModuleKey of Object.keys(
        withoutLocalModules(
          block.type,
          manifestBlocks[block.type as keyof typeof manifestBlocks] ?? {},
        ),
      )
    ) {
      const ref = resolveForPath(
        block.introspect,
        importMapResolver,
        dir,
        blockModuleKey,
        references,
      );
      refPromises.push(
        ref.then((ref) => {
          if (ref) {
            if (block.type === "routes") {
              if (ref.inputSchema) {
                return {
                  key: ref.functionRef,
                  config: ref.inputSchema,
                };
              }
              return undefined;
            }
            if ("ignore" in (ref?.functionJSDoc ?? {})) {
              return undefined;
            }
            const ignoreGen = (ref?.functionJSDoc as { ignore_gen: string })
              ?.["ignore_gen"] === "true";
            return {
              blockType: block.type,
              functionKey: ref.functionRef,
              inputSchema: ignoreGen ? undefined : ref.inputSchema,
              outputSchema: ignoreGen ? undefined : ref.outputSchema,
              functionJSDoc: ref.functionJSDoc,
            };
          }
          return undefined;
        }),
      );
    }
  }

  const modules = await Promise.all(refPromises);
  const schema = modules.reduce(
    (builder, mod) => mod ? builder.withBlockSchema(mod) : builder,
    schemaBuilder,
  );
  return schema.build();
};
