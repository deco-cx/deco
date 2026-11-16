import { assert, assertEquals } from "@std/assert";
import {
  codeOf,
  IMPORT_RESOLVER,
  importResolver,
  isSiteModule,
  moduleMarker,
  offersItself,
  resolvedTargets,
  rewriteModuleUrls,
  SITE_MODULES_KEY,
  siteModuleRegistry,
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
