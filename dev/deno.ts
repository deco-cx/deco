// deno-lint-ignore-file no-explicit-any
import type { ParsedSource } from "@deco/deco/engine";
import {
  ImportMapBuilder,
  type ImportMapResolver,
  initLoader,
  parsePath,
} from "@deco/deco/engine";
import { join, SEPARATOR, toFileUrl } from "@std/path";

const visit = (
  program: ParsedSource,
  visitor: Record<string, (node: any) => void>,
) => {
  for (const value of Object.values(program)) {
    const nodeType = (value as any)?.type;

    if (nodeType in visitor) {
      visitor[nodeType](value);
    }

    if (value && typeof value === "object") {
      visit(value, visitor);
    }
  }
};

const importsFrom = async (path: string): Promise<string[]> => {
  const program = await parsePath(path);

  if (!program) {
    return [];
  }

  const imports = new Set<string>();

  visit(program, {
    // Resolves export { default } from '....'
    ExportNamedDeclaration: (node: any) => {
      if (node.source?.type === "StringLiteral") {
        imports.add(node.source.value);
      }
    },
    // Resolves static "import from" statements
    ImportDeclaration: (node: any) => {
      const specifier = node.source.value;

      if (typeof specifier === "string") {
        imports.add(specifier);
      }
    },
    // Resolves dynamic "import()" statements
    CallExpression: (node: any) => {
      if (node.callee?.type !== "Import") {
        return;
      }

      const arg0 = node.arguments?.[0]?.expression;
      if (arg0.type !== "StringLiteral") {
        return;
      }

      imports.add(arg0.value);
    },
  });

  return [...imports.values()];
};

const localAppsFolder = `${Deno.cwd().replaceAll(SEPARATOR, "/")}/apps`;

const skipPath = (path: string) => {
  if (path.endsWith(".tsx")) {
    return false;
  }

  if (
    path.endsWith("manifest.gen.ts") || path.endsWith("mod.ts") ||
    path.includes(localAppsFolder)
  ) {
    return false;
  }

  return true;
};

const resolveRecursively = async (
  path: string,
  context: string,
  loader: (specifier: string) => Promise<string | undefined>,
  importMapResolver: ImportMapResolver,
  cache: Map<string, string>,
) => {
  const resolvedPath = await importMapResolver.resolve(path, context);

  if (!resolvedPath || skipPath(resolvedPath) || cache.has(resolvedPath)) {
    return;
  }

  const [content, imports] = await Promise.all([
    loader(resolvedPath),
    importsFrom(resolvedPath),
  ]);

  if (!content) {
    return;
  }

  cache.set(resolvedPath, content);

  await Promise.all(imports.map((imp) =>
    resolveRecursively(
      imp,
      resolvedPath,
      loader,
      importMapResolver,
      cache,
    )
  ));
};

const readImportMap = async () => {
  const [import_map, deno_json] = await Promise.all([
    Deno.readTextFile("./import_map.json").then(JSON.parse).catch(() => null),
    Deno.readTextFile("./deno.json").then(JSON.parse).catch(() => null),
  ]);

  return {
    imports: {
      ...import_map?.imports,
      ...deno_json?.imports,
    },
    scopes: {
      ...import_map?.scopes,
      ...deno_json?.scopes,
    },
  };
};

export const resolveDeps = async (
  entries: string[],
  cache: Map<string, string>,
) => {
  const importMap = await readImportMap();
  const loader = initLoader();

  const importMapResolver = ImportMapBuilder.new().mergeWith(
    importMap,
    toFileUrl(join(Deno.cwd(), "/")).href,
  );

  for (const entry of entries) {
    await resolveRecursively(
      entry,
      Deno.cwd(),
      loader,
      importMapResolver,
      cache,
    );
  }
};
