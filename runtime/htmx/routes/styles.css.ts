import { walk } from "std/fs/walk.ts";
import { join } from "std/path/join.ts";
import { toFileUrl } from "std/path/mod.ts";
import { Context } from "../../../deco.ts";
import { createHandler } from "../middleware.ts";
import { bundle, type Config } from "../tailwind/bundler.ts";
import { resolveDeps } from "../tailwind/deps.ts";

const TAILWIND_FILE = "tailwind.css";

const cache = new Map<string, string>();

const TO = join(Deno.cwd(), "static", TAILWIND_FILE);
const isDev = Deno.env.get("DECO_PREVIEW");
const mode = isDev ? "dev" : "prod";
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

const getCSSLazy = async (config: Config) => {
  const ctx = Context.active();
  const revision = await ctx.release?.revision() || "";

  if (!cache.has(revision)) {
    const css = await bundle({
      from: TAILWIND_FILE,
      mode,
      config: await withReleaseContent(config),
    });

    cache.set(revision, css);
  }

  return cache.get(revision)!;
};
const getCSS = mode === "prod" ? getCSSEager : getCSSLazy;

addEventListener("hmr", () => {
  cache.clear();
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

export const styles = createHandler(async () => {
  try {
    return new Response(await getCSS(tailwindConfig), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "text/css; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response(null, { status: 404 });
    }

    const errStack = Deno.inspect(error, { colors: false, depth: 100 });
    console.error(`error generating styles`, errStack);
    return new Response(errStack, {
      status: 500,
    });
  }
});
