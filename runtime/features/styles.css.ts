// deno-lint-ignore-file no-explicit-any
import autoprefixer from "npm:autoprefixer@10.4.14";
import cssnano from "npm:cssnano@6.0.1";
import postcss, { type AcceptedPlugin } from "npm:postcss@8.4.27";
import tailwindcss, { type Config } from "npm:tailwindcss@3.4.1";
import { cyan } from "std/fmt/colors.ts";
import { walk } from "std/fs/walk.ts";
import { join, toFileUrl } from "std/path/mod.ts";
import {
  ImportMapBuilder,
  type ImportMapResolver,
} from "../../engine/importmap/builder.ts";
import type { ParsedSource } from "../../engine/schema/deps.ts";
import { initLoader, parsePath } from "../../engine/schema/parser.ts";

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

const localAppsFolder = `${Deno.cwd()}/apps`;

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
  const resolvedPath = importMapResolver.resolve(path, context);

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

const resolveDeps = async (
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

export { type Config } from "npm:tailwindcss@3.4.1";

const DEFAULT_CONFIG: Config = {
  content: ["./**/*.tsx"],
  theme: {},
};

const DEFAULT_TAILWIND_CSS = `
@tailwind base;
@tailwind components;
@tailwind utilities;
`;

// Try to recover config from default file, a.k.a tailwind.config.ts
export const loadTailwindConfig = (root: string): Promise<Config> =>
  import(toFileUrl(join(root, "tailwind.config.ts")).href)
    .then((mod) => mod.default)
    .catch(() => DEFAULT_CONFIG);

const bundle = async (
  { from, mode, config }: {
    from: string;
    mode: "dev" | "prod";
    config: Config;
  },
) => {
  const start = performance.now();

  const plugins: AcceptedPlugin[] = [
    tailwindcss(config),
    autoprefixer(),
  ];

  if (mode === "prod") {
    plugins.push(
      cssnano({ preset: ["default", { cssDeclarationSorter: false }] }),
    );
  }

  const processor = postcss(plugins);

  const content = await processor.process(
    await Deno.readTextFile(from).catch((_) => DEFAULT_TAILWIND_CSS),
    { from: undefined },
  );

  console.info(
    ` 🎨 TailwindCSS ready in ${
      cyan(`${((performance.now() - start) / 1e3).toFixed(1)}s`)
    }`,
  );

  return content.css;
};

const TAILWIND_FILE = "tailwind.css";

const TO: string = join(Deno.cwd(), "static", TAILWIND_FILE);
const _isDev = Deno.env.get("DECO_PREVIEW") ||
  !Deno.env.has("DENO_DEPLOYMENT_ID");
// FIXME @author Marcos V. Candeia since we don't have a build step on HTMX sites so mode should always defaults to dev.
const mode = "dev"; //isDev ? "dev" : "prod";
const getCSSEager = () =>
  Deno.readTextFile(TO).catch(() =>
    `Missing TailwindCSS file in production. Make sure you are building the file on the CI`
  );

const withReleaseContent = async (config: Config) => {
  const allTsxFiles = new Map<string, string>();

  // init search graph with local FS
  const roots = new Set<string>();

  for await (
    const entry of walk(Deno.cwd(), {
      includeDirs: false,
      includeFiles: true,
    })
  ) {
    if (entry.path.endsWith(".tsx") || entry.path.includes("/apps/")) {
      roots.add(toFileUrl(entry.path).href);
    }
  }

  const start = performance.now();
  await resolveDeps([...roots.values()], allTsxFiles);
  const duration = (performance.now() - start).toFixed(0);

  console.log(
    ` 🔍 TailwindCSS resolved ${allTsxFiles.size} dependencies in ${duration}ms`,
  );

  return {
    ...config,
    content: [...allTsxFiles.values()].map((content) => ({
      raw: content,
      extension: "tsx",
    })),
  };
};

let css: string | null = null;
const getCSSLazy = async (config: Config) => {
  return css ??= await bundle({
    from: TAILWIND_FILE,
    mode,
    config: await withReleaseContent(config),
  });
};
const getCSS = mode === "dev" ? getCSSLazy : getCSSEager;

addEventListener("hmr", () => {
  css = null;
});

const tailwindConfig: Config = await import(
  import.meta.resolve(join(Deno.cwd(), "tailwind.config.ts"))
).then((mod) => mod.default).catch(() => ({
  plugins: [],
  content: ["./**/*.tsx"],
  theme: {
    container: { center: true },
  },
}));

export const styles = () => getCSS(tailwindConfig);
