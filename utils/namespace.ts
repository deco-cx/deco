import $ from "https://deno.land/x/dax@0.28.0/mod.ts";

export const namespaceFromGit = async (): Promise<string | undefined> => {
  const lns = await $`git remote show origin -n`.lines();
  if (lns.length < 1) {
    return undefined;
  }
  const fetchUrlLine = lns[1];
  const [_ignoreFetchUrl, _ignoreGitUrl, nsAndGit] = fetchUrlLine.split(":");
  const [namespace] = nsAndGit.split(".");
  return namespace.trimEnd();
};
