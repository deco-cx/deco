import { cyan } from "@std/fmt/colors";
import { walk } from "@std/fs";
import { join, SEPARATOR, toFileUrl } from "@std/path";
import autoprefixer from "npm:autoprefixer@10.4.14";
import cssnano from "npm:cssnano@6.0.1";
import postcss, { type AcceptedPlugin } from "npm:postcss@8.4.27";
import tailwindcss, { type Config } from "npm:tailwindcss@3.4.1";
import { resolveDeps } from "./deno.ts";

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
    .catch((err) => {
      console.warn(
        "could not load tailwind config from tailwind.config.ts",
        err,
      );
      return DEFAULT_CONFIG;
    });

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

const isDev = Deno.env.get("DECO_PREVIEW") ||
  !Deno.env.has("DENO_DEPLOYMENT_ID") || !Deno.env.has("TAILWIND_MODE_PROD");

const mode = isDev ? "dev" : "prod";

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
    const path = entry.path.replaceAll(SEPARATOR, "/");
    if (path.endsWith(".tsx") || path.includes("/apps/")) {
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

const getCSS = async (config: Config): Promise<string> => {
  return await bundle({
    from: TAILWIND_FILE,
    mode,
    config: await withReleaseContent(config),
  });
};

const TO: string = join(Deno.cwd(), "static", TAILWIND_FILE);

export const build = async (): Promise<void> => {
  await getCSS(tailwindConfig ??= await loadTailwindConfig(Deno.cwd())).then(
    (txt) => Deno.writeTextFile(TO, txt),
  );
};
let tailwindConfig: null | Config = null;

addEventListener("hmr", async () => {
  await build();
});
