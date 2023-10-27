import * as colors from "https://deno.land/std@0.204.0/fmt/colors.ts";
import {
  ensureDir,
  ensureFile,
  exists,
} from "https://deno.land/std@0.204.0/fs/mod.ts";

import { join } from "https://deno.land/std@0.204.0/path/mod.ts";
import {
  BlobReader,
  ZipReader,
} from "https://deno.land/x/zipjs@v2.7.30/index.js";
import { getReleaseJSONFromRelease } from "../engine/releases/json.ts";

interface Config {
  appName: string;
  git: string;
  release: string;
}

const TEMPLATES = {
  commerce: {
    vtex: {
      appName: "deco-sites/storefront",
      release: "https://storefront-vtex.deco.site/live/release",
      git:
        "https://github.com/deco-sites/storefront/archive/refs/heads/main.zip",
    },
    vnda: {
      appName: "deco-sites/storefront",
      release: "https://storefront-vnda.deco.site/live/release",
      git:
        "https://github.com/deco-sites/storefront/archive/refs/heads/main.zip",
    },
    linx: {
      appName: "deco-sites/storefront",
      release: "https://storefront-linx.deco.site/live/release",
      git:
        "https://github.com/deco-sites/storefront/archive/refs/heads/main.zip",
    },
    wake: {
      appName: "deco-sites/storefront",
      release: "https://storefront-wake.deco.site/live/release",
      git:
        "https://github.com/deco-sites/storefront/archive/refs/heads/main.zip",
    },
    shopify: {
      appName: "deco-sites/storefront",
      release: "https://store-shopify.deco.site/live/release",
      git:
        "https://github.com/deco-sites/storefront/archive/refs/heads/main.zip",
    },
  },
  "start from scratch": {
    appName: "deco-sites/start",
    release: "https://start.deco.site/live/release",
    git: "https://github.com/deco-sites/start/archive/refs/heads/main.zip",
  },
} satisfies Record<string, Config | Record<string, Config>>;

const progress = (msg: string) => {
  const promise = Deno.stdout.write(new TextEncoder().encode(`> ${msg}`));

  return () =>
    promise.then(() =>
      Deno.stdout.write(new TextEncoder().encode(" [DONE]\n"))
    );
};

const promptAlternatives = <T extends string>(
  msg: string,
  alternatives: T[],
  defaultAlternative?: T,
) => {
  const formatted = new Intl.ListFormat(undefined, { type: "disjunction" })
    .format(alternatives);

  let choice = prompt(`${msg} ${formatted}`) || defaultAlternative;
  for (
    ;
    !choice || !alternatives.includes(choice as T);
    choice = prompt(`Please choose between ${formatted}`) ?? undefined
  );

  return choice as T;
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

  const { filename: rootFilename } = entries.shift();

  for (const { directory, filename, getData } of entries) {
    if (directory) continue;

    const filepath = join(root, filename.replace(rootFilename, ""));

    await ensureFile(filepath);
    const file = await Deno.open(filepath, { create: true, write: true });
    await getData(file.writable);
  }
  await zipReader.close();
  await done();

  done = progress("Using blocks from template");
  const releaseJson = await fetch(config.release).then((res) => res.json());

  await Deno.writeTextFile(
    join(root, ".release.json"),
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

const logInstructions = (root: string) => {
  const base = root.replace(Deno.cwd(), "");

  console.log("The project is setup at", colors.cyan(base));
  console.log(
    "For help and insights, join our community at https://deco.cx/discord 🎉",
  );
  console.log("To start coding, run");

  console.log("\ncd", base, "&&", "deno task play\n");

  const spinServer = promptAlternatives(
    "Do you want me to run this command for you?",
    ["Y", "n"],
    "Y",
  );

  if (spinServer === "Y") {
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

const initApp = (name: string) => {
  console.log("soon");
};

const initSite = async (name: string) => {
  const siteType = promptAlternatives(
    "What type of site do you want to build?",
    ["commerce", "starting from scratch"],
    "commerce",
  );

  const platform = siteType === "commerce" &&
    promptAlternatives("What commerce platform are you building for?", [
      "vtex",
      "vnda",
      "linx",
      "wake",
      "shopify",
    ]);

  const template = siteType === "commerce" && platform
    ? TEMPLATES["commerce"][platform]
    : siteType === "starting from scratch"
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

const main = () => {
  colors.setColorEnabled(true);

  console.log(DECO_CX);

  const kind = promptAlternatives("What do you want to build?", [
    "app",
    "website",
  ], "website");

  const name = prompt(`What is the name of your ${kind}?`) || "awesome-deco";

  if (!name) return;

  if (kind === "app") {
    return initApp(name);
  } else if (kind === "website") {
    return initSite(name);
  }
};

await main();
