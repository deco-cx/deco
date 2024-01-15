import * as colors from "https://deno.land/std@0.204.0/fmt/colors.ts";
import {
  ensureDir,
  ensureFile,
  exists,
} from "https://deno.land/std@0.204.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.204.0/path/mod.ts";
import {
  Input,
  prompt,
  Select,
  Toggle,
} from "https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/mod.ts";
import {
  BlobReader,
  ZipReader,
} from "https://deno.land/x/zipjs@v2.7.30/index.js";
import { getReleaseJSONFromRelease } from "../engine/releases/json.ts";
import { init as initApp } from "./apps/init.ts";

interface Config {
  appName: string;
  git: string;
  release: string | Record<string, unknown>;
}

const TEMPLATES = {
  commerce: {
    vtex: {
      appName: "deco-sites/storefront",
      release: "https://storefront-vtex.deco.site/.decofile",
      git:
        "https://github.com/deco-sites/storefront/archive/refs/heads/main.zip",
    },
    vnda: {
      appName: "deco-sites/storefront",
      release: "https://storefront-vnda.deco.site/.decofile",
      git:
        "https://github.com/deco-sites/storefront/archive/refs/heads/main.zip",
    },
    linx: {
      appName: "deco-sites/storefront",
      release: "https://storefront-linx.deco.site/.decofile",
      git:
        "https://github.com/deco-sites/storefront/archive/refs/heads/main.zip",
    },
    wake: {
      appName: "deco-sites/storefront",
      release: "https://storefront-wake.deco.site/.decofile",
      git:
        "https://github.com/deco-sites/storefront/archive/refs/heads/main.zip",
    },
    shopify: {
      appName: "deco-sites/storefront",
      release: "https://store-shopify.deco.site/.decofile",
      git:
        "https://github.com/deco-sites/storefront/archive/refs/heads/main.zip",
    },
  },
  "start from scratch": {
    appName: "deco-sites/storefront",
    release: {
      "site": {
        "seo": {
          "type": "website",
          "image":
            "https://ozksgdmyrqcxcwhnbepg.supabase.co/storage/v1/object/public/assets/2177/a5d890ba-e5b8-471e-8b77-7412c1d4fa56",
          "title": "Storefront",
          "jsonLDs": [],
          "canonical": "https://fashion.deco.site",
          "noIndexing": false,
          "description": "Improve your page performance with deco.cx",
          "titleTemplate": "%s | deco.cx",
          "descriptionTemplate": "%s | Deco.cx",
        },
        "theme": {
          "__resolveType": "Theme",
        },
        "global": [],
        "routes": [
          {
            "__resolveType": "website/loaders/pages.ts",
          },
          {
            "__resolveType": "website/loaders/redirects.ts",
          },
        ],
        "commerce": {
          "platform": "other",
        },
        "platform": "vtex",
        "__resolveType": "deco-sites/storefront/apps/site.ts",
      },
      "files": {
        "__resolveType": "decohub/apps/files.ts",
      },
      "Theme": {
        "font": {
          "fonts": [
            {
              "family": "Poppins",
              "variations": [
                {
                  "weight": "400",
                },
                {
                  "weight": "600",
                },
                {
                  "weight": "700",
                },
              ],
            },
          ],
          "__resolveType": "website/loaders/fonts/googleFonts.ts",
        },
        "fonts": [
          {
            "fontFamily": "Poppins",
          },
        ],
        "mainColors": {
          "neutral": "#f9f9f9",
          "primary": "#384c53",
          "warning": "#e08e00",
          "base-100": "#ffffff",
          "tertiary": "#ffeaaf",
          "secondary": "#ffeaaf",
        },
        "buttonStyle": {
          "--border-btn": "1px",
          "--rounded-btn": "0.2rem",
          "--animation-btn": "0.25s",
          "--btn-text-case": "normal-case",
          "--btn-focus-scale": "0.95",
        },
        "colorScheme": "light",
        "otherStyles": {
          "--tab-border": "1px",
          "--tab-radius": "0.5rem",
          "--rounded-box": "1rem",
          "--rounded-badge": "1.9rem",
          "--animation-input": "0.2s",
        },
        "__resolveType": "deco-sites/storefront/sections/Theme/Theme.tsx",
        "complementaryColors": {
          "primary": {
            "primary-content": "#ffffff",
          },
          "base-200": "#ffffff",
          "base-300": "#ffffff",
          "neutral-content": "#f9f9f9",
        },
      },
    },
    git: "https://github.com/deco-sites/storefront/archive/refs/heads/main.zip",
  },
} satisfies Record<string, Config | Record<string, Config>>;

const progress = (msg: string) => {
  const promise = Deno.stdout.write(new TextEncoder().encode(`> ${msg}`));

  return () =>
    promise.then(() =>
      Deno.stdout.write(new TextEncoder().encode(" [DONE]\n"))
    );
};

const initProject = async (name: string, config: Config) => {
  const root = join(Deno.cwd(), name);

  if (await exists(root)) {
    return console.warn(
      `Project under ${root} already exists. Either remove this folder or create a project with a different name`,
    );
  }

  await ensureDir(root);

  console.log("");

  // TODO: I've seen we have a way to do stream reading this, however we may need a transform accumulator stream
  let done = progress("Downloading project");
  const blob = await fetch(config.git).then((res) => res.blob());
  await done();

  done = progress("Writing project to filesystem");
  const zipReader = new ZipReader(new BlobReader(blob));
  const entries = await zipReader.getEntries();

  const entry = entries.shift();

  if (!entry) {
    return console.error("Failed to unzip project");
  }

  const { filename: rootFilename } = entry;

  for (const { directory, filename, getData } of entries) {
    if (directory) continue;

    const filepath = join(root, filename.replace(rootFilename, ""));

    await ensureFile(filepath);
    const file = await Deno.open(filepath, { create: true, write: true });
    await getData?.(file.writable);
  }
  await zipReader.close();
  await done();

  done = progress("Using blocks from template");
  const releaseJson = typeof config.release === "string"
    ? await fetch(config.release).then((res) => res.json())
    : config.release;

  await Deno.writeTextFile(
    join(root, ".decofile.json"),
    JSON.stringify(
      getReleaseJSONFromRelease(releaseJson, config.appName),
      null,
      2,
    ),
  );
  await done();

  console.log("");

  return root;
};

const logInstructions = async (root: string) => {
  const base = root.replace(Deno.cwd(), "");

  console.log("The project is setup at", colors.cyan(base));
  console.log(
    "For help and insights, join our community at https://deco.cx/discord 🎉",
  );
  console.log("To start coding, run");

  console.log("\ncd", base, "&&", "deno task play\n");

  const spinServer = await Toggle.prompt({
    message: "Do you want me to run this command for you?",
    default: true,
  });

  if (spinServer) {
    new Deno.Command(Deno.execPath(), {
      args: ["task", "play"],
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    }).spawn();
  } else {
    console.log("\n🐁 Happy coding at", colors.green("deco.cx"), "\n");
  }
};

const initSite = async (name: string) => {
  const { kind, platform } = await prompt([
    {
      type: Select,
      name: "kind",
      message: "What type of site do you want to build?",
      default: "commerce",
      options: [
        { value: "commerce" },
        { value: "starting from scratch" },
      ],
    },
    {
      type: Select,
      name: "platform",
      message: "What commerce platform are you building for?",
      options: [
        { value: "vtex" },
        { value: "vnda" },
        { value: "linx" },
        { value: "wake" },
        { value: "shopify" },
      ],
      before: async ({ kind }, next) => {
        if (kind === "commerce") {
          await next();
        }
      },
    },
  ]);

  const template = kind === "commerce" && platform
    ? TEMPLATES["commerce"][
      platform as "vtex" | "vnda" | "linx" | "wake" | "shopify"
    ]
    : kind === "starting from scratch"
    ? TEMPLATES["start from scratch"]
    : null;

  if (!template) {
    return console.warn(
      "I could not understand what you typed, please try again",
    );
  }

  const root = await initProject(name, template);

  if (!root) return;

  logInstructions(root);
};

const DECO_CX = `Welcome to ${colors.green("deco.cx")}!`;

const main = async () => {
  colors.setColorEnabled(true);

  console.log(DECO_CX);

  const { kind, name } = await prompt([
    {
      type: Select,
      name: "kind",
      message: "What do you want to build?",
      default: "site",
      options: [
        { value: "site" },
        { value: "app" },
      ],
    },
    {
      type: Input,
      name: "name",
      message: "What is the name of your project?",
      default: "awesome-deco",
    },
  ]);

  if (!name) return;

  if (kind === "app") {
    return initApp(name);
  } else if (kind === "site") {
    return initSite(name);
  }
};

await main();
