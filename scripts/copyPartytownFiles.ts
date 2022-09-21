import { ensureDirSync } from "https://deno.land/std@0.156.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.156.0/path/mod.ts";

const partytownUrlPrefix = "https://unpkg.com/@builder.io/partytown@0/lib/";
const partytownFiles = [
  "partytown.js",
  "partytown-sw.js",
  "partytown-media.js",
  "partytown-atomics.js",
];
const partytownDebugFiles = [
  ...partytownFiles.map((filename) => `/debug/${filename}`),
  "/debug/partytown-sandbox-sw.js",
  "/debug/partytown-ww-atomics.js",
  "/debug/partytown-ww-sw.js",
];

async function fetchAndWriteFiles(files: string[], dest: string) {
  const unpkFiles = await Promise.all(
    files.map((file) =>
      fetch(`${partytownUrlPrefix}/${file}`).then((res) => res.text())
    ),
  );

  files.forEach((fileName, index) => {
    Deno.writeTextFileSync(
      join(dest, fileName),
      unpkFiles[index],
      { create: true },
    );
  });
}

export async function copyLibFiles(dest: string, opts: { debugDir?: boolean }) {
  console.log("Creating destination folder:", dest);
  ensureDirSync(dest);

  console.log("Fetching and writing partytown files...");
  await fetchAndWriteFiles(partytownFiles, dest);

  if (opts.debugDir) {
    const debugFolder = join(dest, "./debug/");

    console.log("Debug flag enabled. Creating debug folder: ", debugFolder);
    ensureDirSync(debugFolder);

    await fetchAndWriteFiles(partytownDebugFiles, dest);
  }

  console.log("Finished.");
}

let destination = "";
const opts = { debugDir: false };

const [arg0, arg1] = Deno.args;

if (typeof arg0 !== "string" || arg0.length === 0 || arg0.startsWith("-")) {
  throw new Error(
    "Missing destination directory. \n Run deno task <taskName> <destination_folder>",
  );
}

destination = arg0;

if (arg1 === "--debug") {
  opts.debugDir = true;
}

copyLibFiles(destination, opts);
