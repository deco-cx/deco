import { resolveJsrSpecifier } from "./jsr.ts";
import { resolveImportMap, resolveModuleSpecifier } from "./mod.ts";

export interface ImportMapResolver {
  resolve(
    specifier: string,
    context: string,
  ): Promise<string | null> | string | null;
}

const useEsm = (npmSpecifier: string) => {
  const withoutNpm = npmSpecifier.substring("https://esm.sh/".length);
  return `https://esm.sh/${withoutNpm}`;
};

export interface ImportMap {
  imports: Record<string, string>;
}

class NativeImportMapResolver implements ImportMapResolver {
  async resolve(specifier: string, context: string): Promise<string | null> {
    // should use origin
    if (specifier.startsWith("/")) {
      const pathUrl = new URL(import.meta.resolve(context));
      return `${pathUrl.origin}${specifier}`;
    }

    // relative import
    if (specifier.startsWith(".")) {
      return import.meta.resolve(
        new URL(specifier, import.meta.resolve(context)).toString(),
      );
    }

    if (specifier.startsWith("https://esm.sh/")) {
      return useEsm(specifier);
    }
    // import from import_map
    try {
      return await resolveJsrSpecifier(import.meta.resolve(specifier));
    } catch {
      return null;
    }
  }
}

const NATIVE_RESOLVER = new NativeImportMapResolver();
export const ImportMapBuilder = {
  new: (...resolvers: ImportMapResolver[]) => {
    return {
      mergeWith: (importMap: ImportMap, context: string): ImportMapResolver => {
        const resolvedImportMap = resolveImportMap(importMap, new URL(context)); // { imports: { "file:///project/dir/foo/": "file:///project/dir/bar/" }, scopes: {} }
        return ImportMapBuilder.new(...resolvers, {
          resolve: (specifier: string, context: string) => {
            try {
              return resolveModuleSpecifier(
                specifier,
                resolvedImportMap,
                new URL(context),
              ) ?? null;
            } catch {
              return null;
            }
          },
        });
      },
      resolve: async (specifier: string, context: string) => {
        const chainedImportResolvers = [...resolvers, NATIVE_RESOLVER];
        for (const resolver of chainedImportResolvers) {
          const result = await resolver.resolve(specifier, context);

          if (result !== null && !result.startsWith("jsr:")) {
            return result;
          }
        }
        // should never reach here if the import map is valid
        throw new Error(`${specifier} could not be resolved at ${context}`);
      },
    };
  },
};
