import { AppManifest } from "../../blocks/app.ts";
import { DecoContext } from "../../deco.ts";
import { JSONSchema7 } from "../../deps.ts";
import { resolvable } from "../../utils/admin.ts";
import { randId as ulid } from "../../utils/rand.ts";
import { Resolvable } from "../core/resolver.ts";
import { notUndefined, singleFlight } from "../core/utils.ts";
import { Schemas } from "./builder.ts";
import { genSchemas } from "./reader.ts";

const getResolveType = (schema: unknown): string | undefined => {
  const asJsonSchema = schema as JSONSchema7;
  if (
    asJsonSchema?.required && asJsonSchema?.required.length === 1 &&
    asJsonSchema?.properties?.["__resolveType"]
  ) {
    return (asJsonSchema?.properties?.["__resolveType"] as
      | JSONSchema7
      | undefined)?.default as string;
  }
  return undefined;
};
const indexedBlocks = (
  decoManifest: AppManifest & {
    routes?: unknown;
    islands?: unknown;
  },
): Record<string, Record<string, boolean>> => {
  const {
    baseUrl: _ignoreBaseUrl,
    routes: _ignoreRoutes,
    islands: _ignoreIslands,
    name: _ignoreName,
    ...blocks
  } = decoManifest;
  const indexedBlocks: Record<string, Record<string, boolean>> = {};
  for (const [blkType, blkValues] of Object.entries(blocks)) {
    for (const blkKey of Object.keys(blkValues)) {
      indexedBlocks[blkType] ??= {};
      indexedBlocks[blkType][blkKey] = true;
    }
  }
  return indexedBlocks;
};
/**
 * This function basically incorporate saved blocks in the schema so the user can select it through the UI as part of the schema.
 * So it is divided in two phases
 * 1. The first phase is responsible for incorporating on the root block types its saved definitions. For instance, handlers, sections and pages has no differentiation between its returns. So I don't need to group it individually they can be group alltogether
 * 2. The second phase is for loaders that needs to be referenced based on its return type. So instead of putting in the loaders root type it should be put on its return type definition, e.g whereas a Product[] fit, a saved loader that returns a Product[] also fit.
 */
const incorporateSavedBlocksIntoSchema = <
  TAppManifest extends AppManifest = AppManifest,
>(
  manifest: TAppManifest,
  schema: Schemas,
  release: Record<string, Resolvable>,
): Schemas => {
  const indexed = indexedBlocks(manifest);
  // excluding loaders, functions and flags, any type of block can be saved and addressed
  // loaders and functions cannot be swapped with each other so they are individually separated in the loop below
  // e.g. you can swap out a loader that returns a Product[] to a loader that returns ProductDetailsPage, but you can swap out a section by another without any problem.
  // so this code is grouping sections with its saved blocks.
  const { loaders, functions, flags, ...currentRoot } = schema.root;
  const root: Record<string, JSONSchema7> = { loaders, functions, flags };
  for (const [ref, val] of Object.entries(currentRoot)) {
    root[ref] = { ...val, anyOf: [...val?.anyOf ?? []] };
    for (const [key, obj] of Object.entries(release)) {
      const resolveType = (obj as { __resolveType: string })?.__resolveType;
      if (
        resolveType &&
        indexed?.[ref]?.[resolveType] !== undefined // checking if the current ref has its resolve type "ref" is the block type and resolveType is the key of the block e.g. website/loaders/secret.ts
      ) {
        root[ref].anyOf!.push(
          resolvable(
            resolveType,
            key,
          ),
        );
        if (ref === "sections") { // sections can be used individually so it can be replicated on the loop below.
          continue;
        }
        delete release[key];
      }
    }
  }

  const definitions: Record<string, JSONSchema7> = {};
  for (const [ref, val] of Object.entries(schema.definitions)) {
    const anyOf = val.anyOf;
    definitions[ref] = val;
    const first = anyOf && (anyOf[0] as JSONSchema7).$ref;
    if (first === "#/definitions/Resolvable") { // means that this block can be swapped out to a saved block
      anyOf?.splice(0, 1); // remove resolvable
      definitions[ref] = { ...val, anyOf: [...val?.anyOf ?? []] }; // create a any of value instead of the value itself
      const availableFunctions = (anyOf?.map((func) =>
        getResolveType(func)
      ) ?? []).filter(notUndefined).reduce((acc, f) => {
        acc[f] = true;
        return acc;
      }, {} as Record<string, boolean>); // get all blocks that matches with the given block
      for (const [key, obj] of Object.entries(release)) { // find those blocks as saved block
        const resolveType = (obj as { __resolveType: string })
          ?.__resolveType; // get the block key

        if (
          resolveType &&
          availableFunctions[resolveType] // if this block is available to be used
        ) {
          // add the block in the anyOf array
          definitions[ref].anyOf?.push(resolvable(
            (obj as { __resolveType: string })?.__resolveType ??
              "UNKNOWN",
            key,
          ));
        }
      }
    }
  }
  return { definitions, root };
};

export interface LazySchema {
  /**
   * Calculates the schema when its first accessed. It is thread-safe, so you can call multiple times.
   */
  value: Promise<Schemas>;
  /**
   * The revision of the schema. It is used to invalidate the cache.
   */
  revision: Promise<string>;
}
const ctxSchema = new WeakMap();

/**
 * This function is responsible for creating a lazy schema that will be used in the runtime.
 * It will create a single flight to avoid multiple calls to the schema generation and will also cache the schema based on the revision.
 * It uses a weak map that guarantees that when ctx is garbage collected so schema will as well.
 * @param ctx the context of the runtime
 * @returns the lazy schema
 */
export const lazySchemaFor = (ctx: Omit<DecoContext, "schema">): LazySchema => {
  if (ctxSchema.has(ctx)) {
    return ctxSchema.get(ctx)!;
  }
  let latestRevision: string = ulid();
  let _cached: Schemas | undefined;
  const sf = singleFlight<Schemas>();
  const ls = {
    get value() {
      return sf.run(async () => {
        const revision = await ctx.release!.revision();
        if (revision !== latestRevision || !_cached) {
          const { manifest, importMap } = await ctx.runtime!;
          _cached = incorporateSavedBlocksIntoSchema(
            manifest,
            await genSchemas(manifest, importMap),
            {
              ...await ctx.release!.state(),
            },
          );
          latestRevision = revision;
        }
        return _cached;
      });
    },
    get revision() {
      return ctx.release!.revision();
    },
  };
  ctxSchema.set(ctx, ls);
  return ls;
};
