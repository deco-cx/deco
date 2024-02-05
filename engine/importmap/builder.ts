import {
  resolveImportMap,
  resolveModuleSpecifier,
} from "https://deno.land/x/importmap@0.2.1/mod.ts";

export interface ImportSpecifier {
  url: string | URL;
}

export interface ImportMapResolver {
  resolve(specifier: string, context: string): ImportSpecifier | null;
  with(resolver: ImportMapResolver): ImportMapResolver;
}

const useEsm = (npmSpecifier: string) => {
  const withoutNpm = npmSpecifier.substring("https://esm.sh/".length);
  return `https://esm.sh/${withoutNpm}`;
};

export interface ImportMap {
  imports: Record<string, string>;
}

class NativeImportMapResolver implements ImportMapResolver {
  resolve(specifier: string, context: string): ImportSpecifier | null {
    // should use origin
    if (specifier.startsWith("/")) {
      const pathUrl = new URL(import.meta.resolve(context));
      return { url: `${pathUrl.origin}${specifier}` };
    }

    // relative import
    if (specifier.startsWith(".")) {
      return {
        url: import.meta.resolve(
          new URL(specifier, import.meta.resolve(context)).toString(),
        ),
      };
    }

    if (specifier.startsWith("https://esm.sh/")) {
      return { url: useEsm(specifier) };
    }
    // import from import_map
    return { url: import.meta.resolve(specifier) };
  }

  with(resolver: ImportMapResolver): ImportMapResolver {
    return new ChainedImportMapResolver(this, resolver);
  }
}
class InlineImportMapResolver implements ImportMapResolver {
  private importMap: ImportMap;

  constructor(importMap: ImportMap) {
    this.importMap = importMap;
  }

  resolve(specifier: string, _context: string): ImportSpecifier | null {
    const resolvedUrl = this.importMap.imports[specifier];

    if (resolvedUrl) {
      return { url: new URL(resolvedUrl) };
    } else {
      return null;
    }
  }

  with(resolver: ImportMapResolver): ImportMapResolver {
    return new ChainedImportMapResolver(this, resolver);
  }
}

class ChainedImportMapResolver implements ImportMapResolver {
  private resolvers: ImportMapResolver[];

  constructor(...resolvers: ImportMapResolver[]) {
    this.resolvers = resolvers;
  }

  resolve(specifier: string, context: string): ImportSpecifier | null {
    for (const resolver of this.resolvers) {
      const result = resolver.resolve(specifier, context);

      if (result !== null) {
        return result;
      }
    }

    return null;
  }

  with(resolver: ImportMapResolver): ImportMapResolver {
    return new ChainedImportMapResolver(...this.resolvers, resolver);
  }
}

const NATIVE_RESOLVER = new NativeImportMapResolver();
export const ImportMapBuilder = {
  fromImportMap(importMap: ImportMap): ImportMapResolver {
    return new InlineImportMapResolver(importMap).with(
      NATIVE_RESOLVER,
    );
  },
};
