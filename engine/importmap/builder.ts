import {
  resolveImportMap,
  resolveModuleSpecifier,
} from "https://deno.land/x/importmap@0.2.1/mod.ts";

export interface ImportMapResolver {
  resolve(specifier: string, context: string): string | null;
}

const useEsm = (npmSpecifier: string) => {
  const withoutNpm = npmSpecifier.substring("https://esm.sh/".length);
  return `https://esm.sh/${withoutNpm}`;
};

export interface ImportMap {
  imports: Record<string, string>;
}

class NativeImportMapResolver implements ImportMapResolver {
  resolve(specifier: string, context: string): string | null {
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
      return import.meta.resolve(specifier);
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
      resolve: (specifier: string, context: string) => {
        const chainedImportResolvers = [...resolvers, NATIVE_RESOLVER];
        for (const resolver of chainedImportResolvers) {
          const result = resolver.resolve(specifier, context);

          if (result !== null) {
            return result;
          }
        }
        // should never reach here if the import map is valid
        throw new Error(`${specifier} could not be resolved at ${context}`);
      },
    };
  },
};
