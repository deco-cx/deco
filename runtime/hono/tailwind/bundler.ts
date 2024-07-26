import autoprefixer from "npm:autoprefixer@10.4.14";
import cssnano from "npm:cssnano@6.0.1";
import postcss, { type AcceptedPlugin } from "npm:postcss@8.4.27";
import tailwindcss, { type Config } from "npm:tailwindcss@3.4.1";
import { cyan } from "std/fmt/colors.ts";
import { join, toFileUrl } from "std/path/mod.ts";

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

export const bundle = async (
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
