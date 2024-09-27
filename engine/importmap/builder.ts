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

/**
 * This function is a workaround while deno's team did not resolve the issue with import.meta.resolve
 * Tracked issue: https://github.com/denoland/deno/issues/25579
 * @param specifier specifier to be resolved
 */
export const safeImportResolve = (specifier: string): string => {
  try {
    return import.meta.resolve(specifier);
  } catch (err) {
    const msg = err?.message;
    if (typeof msg === "string") {
      const match = msg.match(JSR_ERROR_REGEX);

      if (match && match[1]) {
        return match[1];
      }
    }
    throw err;
  }
};
const JSR_ERROR_REGEX =
  /Importing (.*?) blocked\. JSR packages cannot import non-JSR remote modules for security reasons\./;
class NativeImportMapResolver implements ImportMapResolver {
  async resolve(specifier: string, context: string): Promise<string | null> {
    // should use origin
    if (specifier.startsWith("/")) {
      const pathUrl = new URL(safeImportResolve(context));
      return `${pathUrl.origin}${specifier}`;
    }

    // relative import
    if (specifier.startsWith(".")) {
      return safeImportResolve(
        new URL(specifier, safeImportResolve(context)).toString(),
      );
    }

    if (specifier.startsWith("https://esm.sh/")) {
      return useEsm(specifier);
    }
    // import from import_map
    try {
      return await resolveJsrSpecifier(safeImportResolve(specifier));
    } catch {
      return null;
    }
  }
}

const NATIVE_RESOLVER = new NativeImportMapResolver();
export const ImportMapBuilder = {
  new: (
    ...resolvers: ImportMapResolver[]
  ): {
    mergeWith: (importMap: ImportMap, context: string) => ImportMapResolver;
  } & ImportMapResolver => {
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
