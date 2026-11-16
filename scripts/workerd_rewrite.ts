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

// Inline (as utils/userAgent.ts does with ua-parser-js): this script also runs
// from a deco checkout against a site's own import map (DECO_LINK).
// deno-lint-ignore no-import-prefix
import { tokenizer, tokTypes as tt } from "npm:acorn@^8.14.0";

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
    // Registry keys are raw paths; a URL's href percent-encodes them
    // (import.meta.resolve("./Price Card.tsx") -> Price%20Card.tsx).
    const path = specifier.slice(prefix.length);
    let decoded = path;
    try { decoded = decodeURIComponent(path); } catch { /* keep it raw */ }
    const mod = modules?.[path] ?? modules?.[decoded];
    if (mod) return Promise.resolve(mod);
  }
  return import(specifier);
};`;

/** `import(` that is a dynamic import call (not `obj.import(` or `x_import(`).
 *  Only the fallback when a site module can't be tokenized. */
const DYNAMIC_IMPORT = /(?<![\w$.])import\(/g;

const resolveWith = (url: string) => `((s) => new URL(s, ${url}).href)`;

/** Text replacement: modules that aren't the site's (unchanged behavior), and
 *  the fallback for a site module the tokenizer can't read. */
const rewriteText = (code: string, url: string, site: boolean): string => {
  let out = code
    .replaceAll("import.meta.url", url)
    .replaceAll("import.meta.resolve(", `${resolveWith(url)}(`);
  if (site) out = out.replace(DYNAMIC_IMPORT, `${IMPORT_RESOLVER}(`);
  return out;
};

const TOKENIZER_OPTIONS = {
  ecmaVersion: "latest",
  sourceType: "module",
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
  allowImportExportEverywhere: true,
  allowHashBang: true,
} as const;

type Edit = [from: number, to: number, text: string];

/** Line-based markers and text replacement: the fallback when the bundle
 *  can't be tokenized (a `// path` line inside a template would be taken for a
 *  marker here). */
const rewriteByLines = (
  body: string,
  selfUrl: string,
  appRoot: string,
): string => {
  let current: string | null = null;
  return body.split("\n").map((line) => {
    const marker = moduleMarker(line);
    if (marker !== null) {
      current = marker;
      return line;
    }
    const site = current !== null && isSiteModule(current);
    const url = JSON.stringify(site ? `file://${appRoot}/${current}` : selfUrl);
    return rewriteText(line, url, site);
  }).join("\n");
};

/**
 * Rewrites `import.meta.url`, `import.meta.resolve(` and dynamic `import(` in
 * a readable (unminified) `deno bundle` body, module by module. The bundle is
 * tokenized once: module markers are its real `// <path>` comments (never the
 * same text inside a string or template), and in site modules only real
 * `import.meta.url` / `import.meta.resolve(` / `import(` expressions change,
 * to the module's own URL under `appRoot` and the registry-aware resolver.
 * Other modules get `selfUrl` and keep `import(`, by text as before.
 */
export function rewriteModuleUrls(
  body: string,
  { selfUrl, appRoot, onFallback }: {
    selfUrl: string;
    appRoot: string;
    /** Called when the bundle can't be tokenized (line-based fallback). */
    onFallback?: (reason: string) => void;
  },
): string {
  const markers: { start: number; end: number; path: string }[] = [];
  let tokens;
  try {
    tokens = [...tokenizer(body, {
      ...TOKENIZER_OPTIONS,
      onComment: (block: boolean, text: string, start: number, end: number) => {
        if (block || (start > 0 && body[start - 1] !== "\n")) return;
        const path = moduleMarker(`//${text}`);
        if (path !== null) markers.push({ start, end, path });
      },
    })];
  } catch (err) {
    onFallback?.((err as Error).message);
    return rewriteByLines(body, selfUrl, appRoot);
  }

  // The module a position belongs to: the last marker before it.
  const moduleAt = (() => {
    let m = -1;
    return (pos: number): string | null => {
      while (m + 1 < markers.length && markers[m + 1].start < pos) m++;
      return m >= 0 ? markers[m].path : null;
    };
  })();
  const word = (t?: { start: number; end: number }) =>
    t ? body.slice(t.start, t.end) : undefined;

  // Token edits, site modules only (positions are increasing).
  const edits: Edit[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type !== tt._import) continue;
    const module = moduleAt(tok.start);
    if (module === null || !isSiteModule(module)) continue;
    if (i > 0 && tokens[i - 1].type === tt.dot) continue; // obj.import(
    const url = JSON.stringify(`file://${appRoot}/${module}`);
    const next = tokens[i + 1];
    if (next?.type === tt.parenL) {
      edits.push([tok.start, tok.end, IMPORT_RESOLVER]);
    } else if (
      next?.type === tt.dot && word(tokens[i + 2]) === "meta" &&
      tokens[i + 3]?.type === tt.dot
    ) {
      const prop = tokens[i + 4];
      if (word(prop) === "url") {
        edits.push([tok.start, prop.end, url]);
      } else if (
        word(prop) === "resolve" && tokens[i + 5]?.type === tt.parenL
      ) {
        edits.push([tok.start, prop.end, resolveWith(url)]);
      }
    }
  }

  // Assemble chunk by chunk: site chunks take their token edits, the others
  // the text replacement they always had.
  const bounds = [0, ...markers.map((m) => m.start), body.length];
  const selfJson = JSON.stringify(selfUrl);
  let out = "";
  let e = 0;
  for (let c = 0; c + 1 < bounds.length; c++) {
    const from = bounds[c];
    const to = bounds[c + 1];
    const marker = c === 0 ? null : markers[c - 1];
    if (marker === null || !isSiteModule(marker.path)) {
      out += rewriteText(body.slice(from, to), selfJson, false);
      while (e < edits.length && edits[e][0] < to) e++;
      continue;
    }
    let pos = from;
    while (e < edits.length && edits[e][0] < to) {
      const [a, b, text] = edits[e++];
      out += body.slice(pos, a) + text;
      pos = b;
    }
    out += body.slice(pos, to);
  }
  return out;
}

/**
 * The executable code of a TS/JS source: comments removed and, when
 * `maskStrings`, the contents of strings and templates blanked (template `${}`
 * expressions are kept). A small scanner, not a parser: enough to tell
 * `import.meta.url` in code from the same text in a comment or a string.
 */
export function codeOf(source: string, maskStrings: boolean): string {
  let out = "";
  let i = 0;
  // Template nesting: each entry counts the `{` open inside a `${...}`.
  const templates: number[] = [];
  let prev = ""; // last significant code char (regex vs division)
  const n = source.length;
  const readString = (quote: string) => {
    let j = i + 1;
    while (j < n && source[j] !== quote && source[j] !== "\n") {
      j += source[j] === "\\" ? 2 : 1;
    }
    const body = source.slice(i, Math.min(j + 1, n));
    out += maskStrings
      ? quote + " ".repeat(Math.max(0, body.length - 2)) + quote
      : body;
    i = j + 1;
    prev = quote;
  };
  const readTemplate = () => {
    // From just after a backtick or a `}` closing `${`, to the next ` or `${`.
    let j = i;
    while (
      j < n && source[j] !== "`" &&
      !(source[j] === "$" && source[j + 1] === "{")
    ) {
      j += source[j] === "\\" ? 2 : 1;
    }
    out += maskStrings ? " ".repeat(j - i) : source.slice(i, j);
    if (source[j] === "`") {
      out += "`";
      i = j + 1;
      prev = "`";
    } else {
      out += "${";
      i = j + 2;
      templates.push(0);
      prev = "{";
    }
  };
  while (i < n) {
    const c = source[i];
    const d = source[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      out += " ";
      continue;
    }
    if (c === "'" || c === '"') {
      readString(c);
      continue;
    }
    if (c === "`") {
      out += "`";
      i++;
      readTemplate();
      continue;
    }
    if (c === "/" && (prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev))) {
      // A regex literal: copy it through its closing slash.
      let j = i + 1;
      let inClass = false;
      while (j < n && source[j] !== "\n") {
        if (source[j] === "\\") j++;
        else if (source[j] === "[") inClass = true;
        else if (source[j] === "]") inClass = false;
        else if (source[j] === "/" && !inClass) break;
        j++;
      }
      out += source.slice(i, j + 1);
      i = j + 1;
      prev = "/";
      continue;
    }
    if (templates.length > 0) {
      if (c === "{") templates[templates.length - 1]++;
      if (c === "}") {
        if (templates[templates.length - 1] === 0) {
          templates.pop();
          out += "}";
          i++;
          readTemplate();
          continue;
        }
        templates[templates.length - 1]--;
      }
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

/** Whether a site file is offered to runtime imports: under one of
 *  {@link SITE_MODULE_DIRS}, a module, and naming itself (`import.meta.url`). */
export const offersItself = (relPath: string, source: string): boolean =>
  isOfferable(relPath) && codeOf(source, true).includes("import.meta.url");

/** A site file the registry may import: a module under
 *  {@link SITE_MODULE_DIRS}, not a test. */
export const isOfferable = (relPath: string): boolean =>
  SITE_MODULE_DIRS.some((dir) => relPath.startsWith(`${dir}/`)) &&
  /\.(?:[jt]sx?)$/.test(relPath) &&
  !/(?:^|[./_-])test\.[jt]sx?$/.test(relPath);

/**
 * Site files a module names with `import.meta.resolve("<relative path>")`, as
 * paths from the site root (`components/shipping/Results.tsx`). The template
 * hands these to `useComponent` too, so they must be in the registry even when
 * they never mention `import.meta.url` themselves. Only offerable targets
 * ({@link isOfferable}) are returned; paths that leave the site root are
 * dropped. Comments are ignored.
 */
export function resolvedTargets(relPath: string, source: string): string[] {
  const dir = relPath.split("/").slice(0, -1);
  const out: string[] = [];
  for (
    const m of codeOf(source, false).matchAll(
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
    // Only files the registry may import: never main.ts, dev.ts or a script,
    // which run code when imported.
    const target = parts.join("/");
    if (!escaped && isOfferable(target)) out.push(target);
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
