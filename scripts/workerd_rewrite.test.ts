import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  codeOf,
  decofileLocalFiles,
  IMPORT_RESOLVER,
  importResolver,
  isSiteModule,
  moduleMarker,
  nodeModeInterop,
  offersItself,
  resolvedTargets,
  rewriteModuleUrls,
  SITE_MODULES_KEY,
  siteModuleRegistry,
  sourceTopLevelValues,
  topLevelVoids,
} from "./workerd_rewrite.ts";

const SELF = "file:///app/app.js";
const opts = { selfUrl: SELF, appRoot: "/app" };

Deno.test("moduleMarker: deno bundle's module lines, nothing else", () => {
  assertEquals(
    moduleMarker("// components/Session.tsx"),
    "components/Session.tsx",
  );
  assertEquals(
    moduleMarker(
      "// deno:https://jsr.io/@deco/deco/1.215.5/hooks/useSection.ts",
    ),
    "deno:https://jsr.io/@deco/deco/1.215.5/hooks/useSection.ts",
  );
  assertEquals(moduleMarker("// @__NO_SIDE_EFFECTS__"), null);
  assertEquals(moduleMarker("  // components/Session.tsx"), null);
  assertEquals(moduleMarker("// a comment."), null);
});

Deno.test("isSiteModule: site files only", () => {
  for (
    const m of [
      "components/Session.tsx",
      "sections/Component.tsx",
      "fresh.gen.ts",
    ]
  ) {
    assert(isSiteModule(m), m);
  }
  for (
    const m of [
      "deno:https://jsr.io/@deco/deco/1.215.5/hooks/useSection.ts",
      "../deno-cache/npm/registry.npmjs.org/preact/10.23.1/dist/preact.mjs",
      ".deno/npm/registry.npmjs.org/x/1.0.0/index.js",
      "dist/worker/src/app.ts",
      "node_modules/x/index.js",
      "/abs/path.ts",
    ]
  ) {
    assert(!isSiteModule(m), m);
  }
});

Deno.test("rewriteModuleUrls: each site module gets its own URL; others the bundle's", () => {
  const body = [
    "var early = import.meta.url;",
    "// deno:https://jsr.io/@deco/deco/1.215.5/hooks/useSection.ts",
    "var lib = import.meta.url;",
    "// components/Session.tsx",
    "var session = useComponent(import.meta.url);",
    "// sections/Component.tsx",
    "var mod = await import(`${ROOT}${component}`);",
    'var r = import.meta.resolve("./x.ts");',
    "// deno:https://jsr.io/@deco/deco/1.215.5/engine/x.ts",
    "var keep = await import(payload);",
  ].join("\n");
  const out = rewriteModuleUrls(body, opts).split("\n");
  assertEquals(out[0], `var early = "${SELF}";`);
  assertEquals(out[2], `var lib = "${SELF}";`);
  assertEquals(
    out[4],
    'var session = useComponent("file:///app/components/Session.tsx");',
  );
  assertEquals(
    out[6],
    `var mod = await ${IMPORT_RESOLVER}(\`\${ROOT}\${component}\`);`,
  );
  assertEquals(
    out[7],
    'var r = ((s) => new URL(s, "file:///app/sections/Component.tsx").href)("./x.ts");',
  );
  // Outside site modules, dynamic import() is untouched.
  assertEquals(out[9], "var keep = await import(payload);");
  // Markers are kept.
  assertEquals(out[3], "// components/Session.tsx");
});

Deno.test("rewriteModuleUrls: only real import( calls in site modules", () => {
  const body = [
    "// components/x.tsx",
    'a.import(1); my_import(2); $import(3); await import("./y.ts");',
  ].join("\n");
  assertEquals(
    rewriteModuleUrls(body, opts).split("\n")[1],
    `a.import(1); my_import(2); $import(3); await ${IMPORT_RESOLVER}("./y.ts");`,
  );
});

Deno.test("importResolver: answers registered site modules, else import()", async () => {
  const key = Symbol.for(SITE_MODULES_KEY);
  const session = { default: "Session" };
  const priceCard = { default: "PriceCard" };
  (globalThis as Record<symbol, unknown>)[key] = {
    "/components/Session.tsx": session,
    "/components/Price Card.tsx": priceCard,
  };
  try {
    const resolve = new Function(
      `${importResolver("/app")}\nreturn ${IMPORT_RESOLVER};`,
    )() as (s: unknown) => Promise<unknown>;
    assertEquals(await resolve("file:///app/components/Session.tsx"), session);
    // A URL href percent-encodes the path; the registry key is raw.
    assertEquals(
      await resolve("file:///app/components/Price%20Card.tsx"),
      priceCard,
    );
    // Not registered: falls back to import() (rejects here: no such file).
    let fellBack = false;
    await resolve("file:///app/components/Missing.tsx").catch(() =>
      fellBack = true
    );
    assert(fellBack);
  } finally {
    delete (globalThis as Record<symbol, unknown>)[key];
  }
});

Deno.test("offersItself: component dirs, modules that name themselves", () => {
  const self = "export default 1; useComponent(import.meta.url);";
  assert(offersItself("components/Session.tsx", self));
  assert(offersItself("sections/Newsletter/Newsletter.tsx", self));
  assert(offersItself("islands/Cart.tsx", self));
  assert(!offersItself("components/Plain.tsx", "export default 1;"));
  assert(!offersItself("dev.ts", self));
  assert(!offersItself("scripts/gen.ts", self));
  assert(!offersItself("components/Session.test.tsx", self));
  assert(!offersItself("components/data.json", self));
});

Deno.test("siteModuleRegistry: namespace imports under the global key", () => {
  const { imports, register } = siteModuleRegistry({
    "/sections/Component.tsx": "file:///site/sections/Component.tsx",
    "/components/Session.tsx": "file:///site/components/Session.tsx",
  });
  assertEquals(
    imports,
    [
      'import * as __siteModule0 from "file:///site/components/Session.tsx";',
      'import * as __siteModule1 from "file:///site/sections/Component.tsx";',
    ].join("\n"),
  );
  assert(register.includes(`Symbol.for("${SITE_MODULES_KEY}")`));
  assert(register.includes('"/components/Session.tsx": __siteModule0,'));
  assert(register.includes('"/sections/Component.tsx": __siteModule1,'));
});

Deno.test("resolvedTargets: site files named with import.meta.resolve", () => {
  assertEquals(
    resolvedTargets(
      "components/shipping/Form.tsx",
      'useComponent(import.meta.resolve("./Results.tsx"), {});\n' +
        "const s = import.meta.resolve('../search/Suggestions.tsx');",
    ),
    ["components/shipping/Results.tsx", "components/search/Suggestions.tsx"],
  );
  // Leaving the site root, bare specifiers and template literals: ignored.
  assertEquals(
    resolvedTargets(
      "components/a.tsx",
      'import.meta.resolve("../../outside.ts"); import.meta.resolve("npm:x");' +
        " import.meta.resolve(`./${name}.tsx`);",
    ),
    [],
  );
});

Deno.test("rewriteModuleUrls: strings, templates, regexes and comments in site modules keep their text", () => {
  const body = [
    "// components/x.tsx",
    "var s = \"import(\" + 'import.meta.url';",
    "var t = `call import(x) at ${import(y)}`;",
    "var r = /import\\(/.test(q);",
    "var u = import.meta.url; /* import(x) import.meta.url */",
  ].join("\n");
  const out = rewriteModuleUrls(body, opts).split("\n");
  assertEquals(out[1], "var s = \"import(\" + 'import.meta.url';");
  assertEquals(
    out[2],
    `var t = \`call import(x) at \${${IMPORT_RESOLVER}(y)}\`;`,
  );
  assertEquals(out[3], "var r = /import\\(/.test(q);");
  assertEquals(
    out[4],
    'var u = "file:///app/components/x.tsx"; /* import(x) import.meta.url */',
  );
});

Deno.test("rewriteModuleUrls: an untokenizable bundle falls back to lines, and says so", () => {
  const seen: string[] = [];
  const out = rewriteModuleUrls(
    ["// components/bad.tsx", "var a = import.meta.url; @@@ import(p)"].join(
      "\n",
    ),
    { ...opts, onFallback: (m) => seen.push(m) },
  );
  assertEquals(seen.length, 1);
  assert(out.includes('"file:///app/components/bad.tsx"'));
  assert(out.includes(`${IMPORT_RESOLVER}(p)`));
});

Deno.test("rewriteModuleUrls: a keyword property inside a template doesn't derail it", () => {
  // acorn's standalone tokenizer loses the template after `?.class` and then
  // reads the rest with strings and code swapped; the parser's tokens don't.
  const seen: string[] = [];
  const body = [
    "// components/x.tsx",
    "var c = `a ${props?.class} b`;",
    "var u = import.meta.url;",
    'var s = "import(";',
    "var w = `w-1/2 2xl:w-2/3`;",
  ].join("\n");
  const out = rewriteModuleUrls(body, {
    ...opts,
    onFallback: (m) => seen.push(m),
  }).split("\n");
  assertEquals(seen, []);
  assertEquals(out[1], "var c = `a ${props?.class} b`;");
  assertEquals(out[2], 'var u = "file:///app/components/x.tsx";');
  assertEquals(out[3], 'var s = "import(";');
});

Deno.test("rewriteModuleUrls: a `// path` line inside a template is not a module marker", () => {
  const body = [
    "// deno:https://jsr.io/@deco/deco/1.0.0/plugins/htmx.ts",
    "var help = `",
    "// fresh.config.ts",
    "export default defineConfig({ url: import.meta.url });",
    "`;",
    "var lib = import.meta.url;",
    "var dyn = await import(x);",
  ].join("\n");
  const out = rewriteModuleUrls(body, opts).split("\n");
  // Still the deco module: bundle URL, plain import(.
  assertEquals(out[5], `var lib = "${SELF}";`);
  assertEquals(out[6], "var dyn = await import(x);");
});

Deno.test("codeOf: drops comments, optionally blanks strings", () => {
  const src = [
    "// import.meta.url in a comment",
    "/* import.meta.url */ const a = 'import.meta.url';",
    "const b = `x ${import.meta.url} y`;",
    "const re = /'/g; const c = import.meta.url;",
  ].join("\n");
  const masked = codeOf(src, true);
  assertEquals(masked.match(/import\.meta\.url/g)?.length, 2);
  assert(!masked.includes("in a comment"));
  assert(codeOf(src, false).includes("'import.meta.url'"));
});

Deno.test("offersItself: a mention in a comment or a string doesn't count", () => {
  assert(
    !offersItself(
      "components/A.tsx",
      "// uses import.meta.url\nexport default 1;",
    ),
  );
  assert(
    !offersItself("components/A.tsx", 'export const s = "import.meta.url";'),
  );
  assert(offersItself("components/A.tsx", "useComponent(import.meta.url);"));
});

Deno.test("resolvedTargets: never main.ts, dev.ts or files outside the component dirs", () => {
  assertEquals(
    resolvedTargets(
      "components/a.tsx",
      'import.meta.resolve("../main.ts"); import.meta.resolve("../dev.ts");' +
        ' import.meta.resolve("../sdk/util.ts");' +
        ' import.meta.resolve("../sections/B.tsx");' +
        ' // import.meta.resolve("./Commented.tsx")',
    ),
    ["sections/B.tsx"],
  );
});

Deno.test("topLevelVoids: top-level and arrow `void 0` only", () => {
  const code = [
    "var a = (void 0).hasAttribute('x');",
    "var f = () => { const g = void 0; return (void 0).closest('p'); };",
    "function h() { return void 0; }",
    "var o = { m() { return void 0; } };",
    "class C { x = void 0; static { void 0; } m() { return void 0; } }",
    "class D { [(void 0).key] = void 0; }",
    "var u = undefined; var n = void 1;",
  ].join("\n");
  const found = topLevelVoids(code, 100);
  assertEquals(found.length, 4);
  for (const [from, to] of found) {
    assertEquals(code.slice(from - 100, to - 100), "void 0");
  }
});

Deno.test("sourceTopLevelValues: values only, in order, types and names left out", () => {
  assertEquals(
    sourceTopLevelValues(
      [
        "type T = { a?: string | undefined };",
        "export const h = (e: CustomEvent | undefined): void => {",
        "  if (e?.detail === undefined) return;",
        "  const el = this as HTMLElement;",
        "  el.dataset.undefined = typeof undefined;",
        "  return void 0;",
        "};",
        "function f(this: HTMLElement) { return this ?? undefined; }",
        "class C { x = this; m() { return undefined; } }",
        "const o = { undefined: 1 };",
      ].join("\n"),
      "x.ts",
    ),
    ["undefined", "this", "undefined"],
  );
  assertEquals(
    sourceTopLevelValues(
      "export const C = () => <div data-x={undefined} />;\n" +
        "export const s = () => this;",
      "x.tsx",
    ),
    ["undefined", "this"],
  );
});

const withSources = (sources: Record<string, string>) => {
  const skipped: string[] = [];
  return {
    skipped,
    options: {
      ...opts,
      sourceOf: (m: string) => sources[m] ?? null,
      onThisSkipped: (m: string, reason: string) =>
        skipped.push(`${m}: ${reason}`),
    },
  };
};

Deno.test("rewriteModuleUrls: site modules get their top-level `this` back", () => {
  const body = [
    "// deno:https://jsr.io/@deco/deco/1.0.0/hooks/useScript.ts",
    "var lib = void 0;",
    "// utils/a11y/drawer.ts",
    "var drawerToggleScript = () => {",
    "  const group = void 0;",
    '  return group.hasAttribute("data-open");',
    "};",
    "function plain() { return void 0; }",
  ].join("\n");
  const { options, skipped } = withSources({
    "utils/a11y/drawer.ts": "export const drawerToggleScript = () => {\n" +
      "  const group = this as HTMLDivElement;\n" +
      '  return group.hasAttribute("data-open");\n};\n' +
      "function plain() { return undefined; }",
  });
  const out = rewriteModuleUrls(body, options).split("\n");
  assertEquals(out[1], "var lib = void 0;");
  assertEquals(out[4], "  const group = this;");
  assertEquals(out[7], "function plain() { return void 0; }");
  assertEquals(skipped, []);
  // Without sources, nothing is restored.
  assertEquals(
    rewriteModuleUrls(body, opts).split("\n")[4],
    "  const group = void 0;",
  );
});

Deno.test("rewriteModuleUrls: an author's `undefined` or `void 0` keeps its value", () => {
  const body = [
    "// components/x.tsx",
    "var h = (e) => {",
    "  if (e.detail === void 0) return;",
    "  return (void 0).closest(e.detail);",
    "};",
    "var a = () => void 0;",
  ].join("\n");
  const { options, skipped } = withSources({
    "components/x.tsx": [
      "export const h = (e: CustomEvent<string | undefined>) => {",
      "  if (e.detail === undefined) return;",
      "  return (this as HTMLElement).closest(e.detail);",
      "};",
      "export const a = () => void 0;",
    ].join("\n"),
  });
  const out = rewriteModuleUrls(body, options).split("\n");
  assertEquals(out[2], "  if (e.detail === void 0) return;");
  assertEquals(out[3], "  return (this).closest(e.detail);");
  assertEquals(out[5], "var a = () => void 0;");
  assertEquals(skipped, []);
});

Deno.test("rewriteModuleUrls: counts that don't match leave the module as is", () => {
  // Tree shaking dropped `unused`: one value short in the bundle.
  const body = ["// components/y.tsx", "var s = () => void 0;"].join("\n");
  const { options, skipped } = withSources({
    "components/y.tsx": "export const unused = () => undefined;\n" +
      "export const s = () => this;",
  });
  assertEquals(rewriteModuleUrls(body, options), body);
  assertEquals(skipped, [
    "components/y.tsx: 2 top-level this/undefined in the source, 1 void 0 in the bundle",
  ]);
});

Deno.test("rewriteModuleUrls: `this` only in comments and strings doesn't count", () => {
  const body = ["// components/y.tsx", "var a = void 0;"].join("\n");
  const { options, skipped } = withSources({
    "components/y.tsx":
      '// this\nexport const a = undefined; const s = "this";',
  });
  assertEquals(rewriteModuleUrls(body, options), body);
  assertEquals(skipped, []);
});

Deno.test("rewriteModuleUrls: a site module that isn't a whole program keeps `void 0`", () => {
  const body = [
    'var init_x = __esm({ "x"() {',
    "// components/x.tsx",
    "var s = void 0; } });",
  ].join("\n");
  const { options, skipped } = withSources({
    "components/x.tsx": "export const s = this;",
  });
  const out = rewriteModuleUrls(body, options);
  assertEquals(skipped.length, 1);
  assert(skipped[0].startsWith("components/x.tsx: "));
  assert(out.includes("var s = void 0;"));
});

Deno.test("rewriteModuleUrls: a module printed in several chunks is paired as a whole", () => {
  const body = [
    "// components/z.tsx",
    "var z_exports = {};",
    "// components/dep.ts",
    "var dep = void 0;",
    "// components/z.tsx",
    "var inject = () => (void 0).id;",
    "var skuId = (x) => x !== void 0 ? x : void 0;",
  ].join("\n");
  const { options, skipped } = withSources({
    "components/z.tsx": "import './dep.ts';\n" +
      "export const inject = () => (this as HTMLElement).id;\n" +
      "export const skuId = (x?: string) => x !== undefined ? x : undefined;",
    "components/dep.ts": "export const dep = undefined;",
  });
  const out = rewriteModuleUrls(body, options).split("\n");
  assertEquals(out[3], "var dep = void 0;");
  assertEquals(out[5], "var inject = () => (this).id;");
  assertEquals(out[6], "var skuId = (x) => x !== void 0 ? x : void 0;");
  assertEquals(skipped, []);
});

Deno.test("sourceTopLevelValues: generics in .tsx and a type named like a value", () => {
  assertEquals(
    sourceTopLevelValues(
      [
        "export type Profile = { name?: string };",
        "export default function Profile(p: Profile) { return <div>{p.name}</div>; }",
        "export const pick = <T extends object>(v: T) => v ?? this;",
        "export const id = <T,>(v: T) => v;",
      ].join("\n"),
      "Profile.tsx",
    ),
    ["this"],
  );
});

// esbuild's CommonJS helpers as `deno bundle` emits them (Deno 2.6.5).
const INTEROP_PREAMBLE = `var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
`;
const toEsm = (condition: string) =>
  `var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  ${condition} ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
`;
const BEFORE_2_9 = toEsm("isNodeMode || !mod || !mod.__esModule");
const SINCE_2_9 = toEsm("1");

// What `import tslib from "tslib"` yields: tslib sets `__esModule`.
const defaultImport = (helpers: string) => {
  const tslib = { __esModule: true, __extends: () => {} };
  return new Function("mod", `${helpers}\nreturn __toESM(mod).default;`)(
    tslib,
  ) as unknown;
};

Deno.test("nodeModeInterop: Deno < 2.9 helper becomes Deno 2.9's", () => {
  const body = `${INTEROP_PREAMBLE}${BEFORE_2_9}var x = 1;\n`;
  assertEquals(
    nodeModeInterop(body),
    `${INTEROP_PREAMBLE}${SINCE_2_9}var x = 1;\n`,
  );
});

Deno.test("nodeModeInterop: renamed parameters (mod2)", () => {
  const renamed = BEFORE_2_9.replaceAll("mod", "mod2");
  assertEquals(nodeModeInterop(renamed), SINCE_2_9.replaceAll("mod", "mod2"));
});

Deno.test("nodeModeInterop: only the __toESM helper changes", () => {
  const user = "const ok = a || !b || !b.__esModule ? 1 : 2;\n";
  const body = `${user}${INTEROP_PREAMBLE}${BEFORE_2_9}${user}`;
  assertEquals(
    nodeModeInterop(body),
    `${user}${INTEROP_PREAMBLE}${SINCE_2_9}${user}`,
  );
});

Deno.test("nodeModeInterop: an __esModule CommonJS module gets its default", () => {
  assertEquals(defaultImport(INTEROP_PREAMBLE + BEFORE_2_9), undefined);
  const fixed = defaultImport(nodeModeInterop(INTEROP_PREAMBLE + BEFORE_2_9));
  assertEquals(typeof (fixed as { __extends: unknown }).__extends, "function");
});

Deno.test("nodeModeInterop: nothing to change on Deno 2.9+ or without CommonJS", () => {
  const since = `${INTEROP_PREAMBLE}${SINCE_2_9}`;
  assertEquals(nodeModeInterop(since), since);
  assertEquals(nodeModeInterop("var a = 1;\n"), "var a = 1;\n");
});

Deno.test("nodeModeInterop: an unknown __esModule check fails the build", () => {
  // Same helper, another shape of the check (not one this knows).
  const other = BEFORE_2_9.replace(
    "isNodeMode || !mod || !mod.__esModule",
    "!(mod && mod.__esModule) || isNodeMode",
  ).replace("__toESM", "__toESM2");
  assertThrows(() => nodeModeInterop(other), Error, "__toESM2");
});

Deno.test("decofileLocalFiles: site CSVs the decofile reads by path", () => {
  const blocks = [
    {
      routes: [
        {
          __resolveType: "website/loaders/redirectsFromCsv.ts",
          from: "/redirect.csv",
        },
        {
          __resolveType: "website/loaders/redirectsFromCsv.ts",
          from: "./a/b.CSV",
        },
        { from: "/redirect.csv" },
      ],
    },
    { list: ["data/x.csv", { nested: "/data/x.csv" }] },
  ];
  assertEquals(decofileLocalFiles(blocks), [
    "a/b.CSV",
    "data/x.csv",
    "redirect.csv",
  ]);
});

Deno.test("decofileLocalFiles: no URLs, static files or paths outside the site", () => {
  const blocks = [{
    a: "https://example.com/redirects.csv",
    b: "file:///etc/x.csv",
    c: "/static/redirects.csv",
    d: "../outside.csv",
    e: "/a/../../x.csv",
    f: "/redirects.csv?x=1",
    g: "/redirects.json",
    // The loader reads `from` untrimmed, and rejects this one.
    j: "/redirects.csv ",
    h: 1,
    i: null,
  }];
  assertEquals(decofileLocalFiles(blocks), []);
});
