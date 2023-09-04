import { AppManifest, SourceMap } from "../../blocks/app.ts";
import { withoutLocalModules } from "../../blocks/appsUtil.ts";
import blocks from "../../blocks/index.ts";
import { JSONSchema7, TsType } from "../../deps.ts";
import { defaultRoutes } from "../../engine/manifest/manifestGen.ts";
import {
  BlockModule,
  EntrypointModule,
  newSchemaBuilder,
  Schemas,
} from "../../engine/schema/builder.ts";
import { Schemeable } from "../../engine/schema/transform.ts";
import { context } from "../../live.ts";
import { Block, BlockModuleRef } from "../block.ts";
import { parsePath } from "./parser.ts";
import { programToBlockRef, resolvePath } from "./transform.ts";

export const namespaceOf = (blkType: string, blkKey: string): string => {
  return blkKey.substring(0, blkKey.indexOf(blkType) - 1);
};

const resolveForPath = async (
  introspect: Block["introspect"],
  blockPath: string,
  blockKey: string,
  references: Map<TsType, Schemeable>,
): Promise<BlockModuleRef | undefined> => {
  const pathResolved = resolvePath(blockPath, Deno.cwd());
  const program = await parsePath(pathResolved);
  if (!program) {
    return undefined;
  }
  return programToBlockRef(
    pathResolved,
    blockKey,
    program,
    references,
    introspect,
  );
};

export const genSchemasFromManifest = async (
  manifest: AppManifest,
  baseDir?: string,
  sourceMap: SourceMap = {},
): Promise<Schemas> => {
  const { baseUrl: _ignore, name: _ignoreName, ...manifestBlocks } = manifest;
  const dir = baseDir ? baseDir : Deno.cwd();

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
  const references = new Map<TsType, Schemeable>();
  for (const block of blocks()) {
    for (
      const blockModuleKey of Object.keys(
        withoutLocalModules(
          block.type,
          manifestBlocks[block.type as keyof typeof manifestBlocks] ?? {},
        ),
      )
    ) {
      const sourceMapResolverVal = sourceMap[blockModuleKey];
      if (sourceMapResolverVal === null) {
        continue;
      }
      const wellKnown = wellKnownLiveRoutes[blockModuleKey];
      const wellKnownSourceMapResolver: [
        string,
        () => Promise<BlockModuleRef | undefined>,
      ] | undefined = wellKnown
        ? [wellKnown[0], () =>
          resolveForPath(
            block.introspect,
            wellKnown[1],
            blockModuleKey,
            references,
          )]
        : undefined;
      const [_namespace, blockRefResolver] = wellKnownSourceMapResolver ??
        (blockModuleKey.startsWith(".")
          ? [
            context.namespace!,
            () =>
              resolveForPath(
                block.introspect,
                blockModuleKey.replace(".", `file://${dir}`),
                blockModuleKey,
                references,
              ),
          ]
          : [
            namespaceOf(block.type, blockModuleKey),
            () =>
              typeof sourceMapResolverVal === "string" ||
                typeof sourceMapResolverVal === "undefined"
                ? resolveForPath(
                  block.introspect,
                  sourceMapResolverVal ?? import.meta.resolve(blockModuleKey),
                  blockModuleKey,
                  references,
                )
                : sourceMapResolverVal(),
          ]);

      refPromises.push(
        blockRefResolver().then((ref) => {
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

const wellKnownLiveRoutes: Record<string, [string, string, string]> =
  defaultRoutes.map(
    (route) => [route.key, route.from],
  ).reduce((idx, [key, from]) => {
    return { ...idx, [key]: ["$live", from, key] };
  }, {});
