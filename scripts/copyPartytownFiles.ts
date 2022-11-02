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
  const fullPathDest = join(Deno.cwd(), dest);
  console.log("Creating destination folder:", dest);
  ensureDirSync(dest);

  console.log("Fetching and writing partytown files...");
  await fetchAndWriteFiles(partytownFiles, fullPathDest);

  if (opts.debugDir) {
    const debugFolder = join(fullPathDest, "./debug/");

    console.log(
      "Debug flag enabled. Creating debug folder: ",
      dest.concat("/debug/"),
    );
    ensureDirSync(debugFolder);

    await fetchAndWriteFiles(partytownDebugFiles, fullPathDest);
  }

  console.log("Finished.");
}

let destination = "";
const defaultDest = "static/~partytown";
const opts = { debugDir: false };

const [arg0, arg1] = Deno.args;

if (typeof arg0 !== "string" || arg0.length === 0 || arg0.startsWith("-")) {
  console.log(`Using default directory ${defaultDest}`);
  destination = defaultDest;
} else {
  destination = arg0;
}

if (arg1 === "--debug") {
  opts.debugDir = true;
}

copyLibFiles(destination, opts);
