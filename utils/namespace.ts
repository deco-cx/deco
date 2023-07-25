import { join } from "https://deno.land/std@0.170.0/path/mod.ts";
import { siteJSON } from "../dev.ts";
import { exists } from "./filesystem.ts";
import stringifyForWrite from "$live/utils/stringifyForWrite.ts";

const sanitizer = (str: string | undefined) =>
  str?.endsWith("/") ? str : `${str}/`;

export const updateImportMap = async (dir: string, ns: string) => {
  const namespace = sanitizer(ns);
  try {
    // try find import map file.
    const denoJSON = JSON.parse(
      await Deno.readTextFile(join(dir, "deno.json")),
    );
    const importMapRelPath = denoJSON["importMap"] ?? "./import_map.json";
    const importMapPath = join(dir, importMapRelPath.replace("./", ""));
    const importMap = JSON.parse(
      await Deno.readTextFile(importMapPath),
    );
    const imports = importMap?.["imports"] ?? {};
    // if theres any namespace add on importMap
    if (!imports[namespace]) {
      await Deno.writeTextFile(
        importMapPath,
        stringifyForWrite(
          {
            ...(importMap ?? {}),
            imports: {
              [namespace]: "./",
              ...imports,
            },
          },
        ),
      );
    }
  } catch (err) {
    console.warn("could not read importmap", err);
  }
};

export const namespaceFromSiteJson = async (dir: string) => {
  const siteJSONPath = join(dir, siteJSON);
  if (await exists(siteJSONPath)) {
    const siteInfo = await Deno.readTextFile(siteJSONPath).then(
      JSON.parse,
    );
    return siteInfo?.namespace;
  }
  return undefined;
};
