import blocks from "$live/blocks/index.ts";
import { ModuleOf } from "$live/engine/block.ts";
import { withoutLocalModules } from "$live/engine/fresh/manifest.ts";
import { defaultRoutes } from "$live/engine/fresh/manifestGen.ts";
import { introspectWith } from "$live/engine/introspect.ts";
import {
  BlockModule,
  EntrypointModule,
  newSchemaBuilder,
  Schemas,
} from "$live/engine/schema/builder.ts";
import { denoDoc } from "$live/engine/schema/utils.ts";
import { context } from "$live/live.ts";
import { AppManifest } from "../../blocks/app.ts";
import { JSONSchema7 } from "../../deps.ts";

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
  for (const block of blocks) {
    for (
      const blockModuleKey of Object.keys(
        withoutLocalModules(
          block.type,
          manifestBlocks[block.type as keyof typeof manifestBlocks] ?? {},
        ),
      )
    ) {
      const [namespace, blockPath, blockKey] =
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

      const docPromise = denoDoc(blockPath);
      modulesPromises.push(docPromise.then(async (doc) => {
        const introspectFunc = introspectWith<ModuleOf<typeof block>>(
          block.introspect,
        );
        const ref = await introspectFunc(
          {
            base: dir,
            namespace,
          },
          blockKey,
          doc,
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
  return schema.build(dir, context.namespace!);
};

const wellKnownLiveRoutes: Record<string, [string, string, string]> =
  defaultRoutes.map(
    (route) => [route.key, route.from],
  ).reduce((idx, [key, from]) => {
    return { ...idx, [key]: ["$live", import.meta.resolve(from), key] };
  }, {});
