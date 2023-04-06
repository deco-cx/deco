import { join } from "https://deno.land/std@0.170.0/path/mod.ts";
import $ from "https://deno.land/x/dax@0.28.0/mod.ts";

const namespaceFromGit = async (): Promise<string | undefined> => {
  const lns = await $`git config --get remote.origin.url`.lines();
  if (lns.length < 1) {
    return undefined;
  }
  const fetchUrlLine = lns[0];
  if (fetchUrlLine.startsWith("http")) { // http clone
    const fetchUrl = new URL(fetchUrlLine);
    return fetchUrl.pathname.substring(1).replace(".git", "").trimEnd(); // remove .git
  }
  if (fetchUrlLine.startsWith("git")) {
    const [_ignoreGitUrl, nsAndGit] = fetchUrlLine.split(":");
    const [namespace] = nsAndGit.split(".");
    return namespace.trimEnd();
  }
  return fetchUrlLine.replace(":", "/").trimEnd();
};

export const namespaceFromImportMap = async (
  dir: string,
): Promise<string | undefined> => {
  try {
    // get from git or undefined if not available
    let namespace = `${await namespaceFromGit()}/`;
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
      let hasNamespaceOnImportMap = false;
      for (
        const [maybeNamespace, importStr] of Object.entries(
          importMap?.["imports"] ?? {},
        )
      ) {
        if (importStr === "./") {
          namespace ??= maybeNamespace;
        }
        hasNamespaceOnImportMap ||= maybeNamespace === namespace;
      }
      // if theres any namespace add on importMap
      if (!hasNamespaceOnImportMap && namespace) {
        const newImportMapImports = importMap?.["imports"] ?? {};
        await Deno.writeTextFile(
          importMapPath,
          JSON.stringify(
            {
              ...(importMap ?? {}),
              imports: {
                [namespace]: "./",
                ...newImportMapImports,
              },
            },
            null,
            2,
          ),
        );
      }
    } catch (err) {
      console.warn("could not read importmap", err);
    }
    return namespace && namespace.substring(0, namespace.length - 1); // removing /
  } catch (err) {
    console.error("could not retrieve namespace error", err);
    return undefined;
  }
};
