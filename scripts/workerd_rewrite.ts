/**
 * Source rewrites for the Worker bundle (see scripts/workerd.ts), kept apart
 * so they can be tested: workerd.ts runs its command when imported.
 *
 * A bundle has no files, so two things a site module may rely on stop working
 * on workerd:
 *
 * - `import.meta.url` (undefined on workerd) used to become the bundle's own
 *   URL in every module, so a module could no longer name itself. The storefront
 *   template's `useComponent(import.meta.url)` then rendered `/app.js` instead
 *   of `/components/Session.tsx`, and the session (cart, user) never loaded.
 * - `import(url)` of a site file computed at runtime (the template's
 *   `sections/Component.tsx` imports `${ROOT}${component}`) has no file to load.
 *
 * `deno bundle` marks where each module starts with a `// <path>` line: site
 * files by their path from the site root, remote ones as `// deno:<url>`. Inside
 * the site's own modules, `import.meta.url` becomes the module's URL under the
 * Worker's root (`file:///app/components/Session.tsx`, which is what
 * `Deno.cwd()` resolves to there) and `import(` goes through a resolver that
 * answers site modules from a registry the Worker entry fills
 * ({@link SITE_MODULES_KEY}). Every other module keeps the bundle's URL and its
 * plain `import(`, as before.
 */

/** Global the Worker entry fills with the site modules a runtime `import()`
 *  may ask for: path from the site root (`/components/Session.tsx`) to the
 *  module namespace. */
export const SITE_MODULES_KEY = "deco.workerd.siteModules";

/** Name of the resolver the rewritten `import(` calls go through. */
export const IMPORT_RESOLVER = "__decoSiteImport";

/** Site directories whose modules the registry offers to a runtime `import()`.
 *  Only these: other site files (dev.ts, main.ts, scripts) run code when they
 *  are imported. */
export const SITE_MODULE_DIRS = ["components", "sections", "islands"];

/** A `// <path>` line that starts a module in a `deno bundle` output, or null.
 *  Bundles keep no other column-0 line comments (regular comments are dropped;
 *  kept ones are indented or are `/*` blocks). */
export const moduleMarker = (line: string): string | null => {
  const match = /^\/\/ (\S.*\.(?:[cm]?[jt]sx?|json))$/.exec(line);
  return match ? match[1] : null;
};

/** Whether a marker names one of the site's own files (a relative path inside
 *  the site root), not a remote module or one of the build's generated files. */
export const isSiteModule = (marker: string): boolean =>
  !/^[a-z][a-z0-9+.-]*:/i.test(marker) && // deno:, npm:, node:, https:, file:
  !marker.startsWith("../") && // outside the site root (e.g. DENO_DIR)
  !marker.startsWith("/") &&
  !marker.startsWith(".") && // hidden dirs: a DENO_DIR inside the site
  !marker.startsWith("dist/") && // the build's generated sources
  !marker.includes("node_modules/") &&
  !marker.includes("/npm/registry.");

/** The runtime resolver, defined at the top of the bundle body. */
export const importResolver = (appRoot: string): string =>
  `const ${IMPORT_RESOLVER} = (specifier) => {
  const prefix = ${JSON.stringify(`file://${appRoot}`)};
  if (typeof specifier === "string" && specifier.startsWith(prefix + "/")) {
    const modules = globalThis[Symbol.for(${JSON.stringify(SITE_MODULES_KEY)})];
    const mod = modules?.[specifier.slice(prefix.length)];
    if (mod) return Promise.resolve(mod);
  }
  return import(specifier);
};`;

/** `import(` that is a dynamic import call (not `obj.import(` or `x_import(`). */
const DYNAMIC_IMPORT = /(?<![\w$.])import\(/g;

/**
 * Rewrites `import.meta.url`, `import.meta.resolve(` and dynamic `import(` in
 * a readable (unminified) `deno bundle` body, module by module: site modules
 * get their own URL under `appRoot` and the registry-aware resolver; the rest
 * get `selfUrl` (the bundle's URL) and keep `import(`.
 */
export function rewriteModuleUrls(
  body: string,
  { selfUrl, appRoot }: { selfUrl: string; appRoot: string },
): string {
  let current: string | null = null;
  const out: string[] = [];
  for (const line of body.split("\n")) {
    const marker = moduleMarker(line);
    if (marker !== null) {
      current = marker;
      out.push(line);
      continue;
    }
    const site = current !== null && isSiteModule(current);
    const url = JSON.stringify(
      site ? `file://${appRoot}/${current}` : selfUrl,
    );
    let rewritten = line
      .replaceAll("import.meta.url", url)
      .replaceAll(
        "import.meta.resolve(",
        `((s) => new URL(s, ${url}).href)(`,
      );
    if (site) {
      rewritten = rewritten.replace(DYNAMIC_IMPORT, `${IMPORT_RESOLVER}(`);
    }
    out.push(rewritten);
  }
  return out.join("\n");
}

/** Whether a site file is offered to runtime imports: under one of
 *  {@link SITE_MODULE_DIRS}, a module, and naming itself (`import.meta.url`). */
export const offersItself = (relPath: string, source: string): boolean =>
  SITE_MODULE_DIRS.some((dir) => relPath.startsWith(`${dir}/`)) &&
  /\.(?:[jt]sx?)$/.test(relPath) &&
  !/(?:^|[./_-])test\.[jt]sx?$/.test(relPath) &&
  source.includes("import.meta.url");

/**
 * Site files a module names with `import.meta.resolve("<relative path>")`, as
 * paths from the site root (`components/shipping/Results.tsx`). The template
 * hands these to `useComponent` too, so they must be in the registry even when
 * they never mention `import.meta.url` themselves. Paths that leave the site
 * root are dropped.
 */
export function resolvedTargets(relPath: string, source: string): string[] {
  const dir = relPath.split("/").slice(0, -1);
  const out: string[] = [];
  for (
    const m of source.matchAll(
      /import\.meta\.resolve\(\s*(["'`])(\.{1,2}\/[^"'`$]+)\1\s*\)/g,
    )
  ) {
    const parts = [...dir];
    let escaped = false;
    for (const seg of m[2].split("/")) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") {
        if (parts.length === 0) escaped = true;
        else parts.pop();
      } else parts.push(seg);
    }
    if (!escaped) out.push(parts.join("/"));
  }
  return out;
}

/** Source for the Worker entry that registers `modules` (path from the site
 *  root -> file URL to import) under {@link SITE_MODULES_KEY}. */
export function siteModuleRegistry(modules: Record<string, string>): {
  imports: string;
  register: string;
} {
  const entries = Object.entries(modules).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const imports = entries
    .map(([, url], i) =>
      `import * as __siteModule${i} from ${JSON.stringify(url)};`
    )
    .join("\n");
  const map = entries
    .map(([path], i) => `  ${JSON.stringify(path)}: __siteModule${i},`)
    .join("\n");
  const register = `(globalThis as Record<symbol, unknown>)[Symbol.for(${
    JSON.stringify(SITE_MODULES_KEY)
  })] = {\n${map}\n};`;
  return { imports, register };
}
