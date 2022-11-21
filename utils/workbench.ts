import { basename } from "https://deno.land/std@0.147.0/path/mod.ts";
import { context } from "$live/live.ts";
import { resolveFilePath } from "$live/utils/filesystem.ts";
import { Node } from "$live/types.ts";

export const getWorkbenchTree = (): Node[] => {
  const sections = context.manifest?.sections ?? {};

  const firstLevel = Object
    .keys(sections)
    .filter((section) =>
      section.split("/").length === 3 && section.endsWith(".tsx")
    )
    .map((component) => ({
      label: basename(component),
      fullPath: component,
      editLink: context.deploymentId === undefined // only allow vscode when developing locally
        ? `vscode://file/${resolveFilePath(component)}`
        : undefined,
    }));

  return [{
    label: "sections",
    fullPath: "./sections",
    children: firstLevel,
  }];
};

export const workbenchHandler = () => {
  return new Response(JSON.stringify(getWorkbenchTree()), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
