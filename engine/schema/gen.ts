import blocks from "$live/blocks/index.ts";
import { withoutLocalModules } from "$live/engine/fresh/manifest.ts";
import { defaultRoutes } from "$live/engine/fresh/manifestGen.ts";
import {
  BlockModule,
  EntrypointModule,
  newSchemaBuilder,
  Schemas,
} from "$live/engine/schema/builder.ts";
import { Schemeable } from "$live/engine/schema/transform.ts";
import { context } from "$live/live.ts";
import { TsType } from "https://esm.sh/v130/@swc/wasm@1.3.76/wasm.js";
import { AppManifest } from "../../blocks/app.ts";
import { JSONSchema7 } from "../../deps.ts";
import { parsePath } from "./parser.ts";
import { programToBlockRef } from "./transform.ts";

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

      const programPromise = parsePath(blockPath);
      modulesPromises.push(programPromise.then(async (doc) => {
        if (!doc) {
          return undefined;
        }
        const ref = await programToBlockRef(
          blockKey,
          doc,
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
  console.log(JSON.stringify(schema.build(dir, context.namespace!)));
  return schema.build(dir, context.namespace!);
};

const wellKnownLiveRoutes: Record<string, [string, string, string]> =
  defaultRoutes.map(
    (route) => [route.key, route.from],
  ).reduce((idx, [key, from]) => {
    return { ...idx, [key]: ["$live", import.meta.resolve(from), key] };
  }, {});
