import { basename } from "https://deno.land/std@0.147.0/path/mod.ts";
import { context } from "$live/live.ts";
import { resolveFilePath } from "$live/utils/filesystem.ts";
import { Node } from "$live/types.ts";

const mapSectionToNode = (component: string) => ({
  label: basename(component),
  fullPath: component,
  editLink: context.deploymentId === undefined // only allow vscode when developing locally
    ? `vscode://file/${resolveFilePath(component)}`
    : undefined,
});

const isFirstLevelSection = (section: string) =>
  section.split("/").length === 3 && section.endsWith(".tsx");

export const isGlobalSection = (section: string) =>
  section.endsWith(".global.tsx");

export const getWorkbenchTree = (): Node[] => {
  const sections = context.manifest?.sections ?? {};

  const firstLevelSection = Object
    .keys(sections)
    .filter((section) => isFirstLevelSection(section));

  const firstLevelNonGlobalSectionNodes: Node[] = firstLevelSection.filter((
    section,
  ) => !isGlobalSection(section)).map(mapSectionToNode);

  const firstLevelGlobalSectionNodes: Node[] = firstLevelSection.filter(
    isGlobalSection,
  ).map(mapSectionToNode);

  return [{
    label: "sections",
    fullPath: "./sections",
    children: firstLevelNonGlobalSectionNodes,
  }, {
    label: "globals",
    fullPath: "./sections",
    children: firstLevelGlobalSectionNodes,
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
