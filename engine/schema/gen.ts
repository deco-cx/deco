import { AppManifest } from "../../blocks/app.ts";
import blocks from "../../blocks/index.ts";
import { JSONSchema7, TsType } from "../../deps.ts";
import { withoutLocalModules } from "../../engine/fresh/manifest.ts";
import { defaultRoutes } from "../../engine/fresh/manifestGen.ts";
import {
  BlockModule,
  EntrypointModule,
  newSchemaBuilder,
  Schemas,
} from "../../engine/schema/builder.ts";
import { Schemeable } from "../../engine/schema/transform.ts";
import { context } from "../../live.ts";
import { parsePath } from "./parser.ts";
import { programToBlockRef, resolvePath } from "./transform.ts";

export const namespaceOf = (blkType: string, blkKey: string): string => {
  return blkKey.substring(0, blkKey.indexOf(blkType) - 1);
};

export const genSchemasFromManifest = async (
  manifest: AppManifest & { baseUrl?: string },
  baseDir?: string,
): Promise<Schemas> => {
  const { baseUrl: _ignore, ...manifestBlocks } = manifest;
  const dir = baseDir ? baseDir : Deno.cwd();

  const rootWithBlocks: Record<string, JSONSchema7> = blocks.reduce(
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

  const modulesPromises: Promise<
    (BlockModule | EntrypointModule | undefined)
  >[] = [];
  const references = new Map<TsType, Schemeable>();
  for (const block of blocks) {
    for (
      const blockModuleKey of Object.keys(
        withoutLocalModules(
          block.type,
          manifestBlocks[block.type as keyof typeof manifestBlocks] ?? {},
        ),
      )
    ) {
      const [_namespace, blockPath, blockKey] =
        wellKnownLiveRoutes[blockModuleKey] ??
          (blockModuleKey.startsWith(".")
            ? [
              context.namespace!,
              blockModuleKey.replace(".", `file://${dir}`),
              blockModuleKey,
            ]
            : [
              namespaceOf(block.type, blockModuleKey),
              import.meta.resolve(blockModuleKey),
              blockModuleKey,
            ]);

      const pathResolved = resolvePath(blockPath, Deno.cwd());
      const programPromise = parsePath(pathResolved);
      modulesPromises.push(programPromise.then(async (program) => {
        if (!program) {
          return undefined;
        }
        const ref = await programToBlockRef(
          pathResolved,
          blockKey,
          program,
          references,
          block.introspect,
        );
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
      }));
    }
  }

  const modules = await Promise.all(modulesPromises);
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
    return { ...idx, [key]: ["$live", import.meta.resolve(from), key] };
  }, {});
