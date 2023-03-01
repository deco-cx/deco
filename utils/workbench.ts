import { basename } from "std/path/mod.ts";
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

const isTSXFile = (section: string) => section.endsWith(".tsx");

export const isGlobalSection = (section: string) =>
  section.endsWith(".global.tsx");

export const getWorkbenchTree = (): Node[] => {
  const sections = context.manifest?.sections ?? {};

  const tsxFileSections = Object
    .keys(sections)
    .filter((section) => isTSXFile(section));

  const firstLevelNonGlobalSectionNodes: Node[] = tsxFileSections.filter((
    section,
  ) => !isGlobalSection(section)).map(mapSectionToNode);

  const firstLevelGlobalSectionNodes: Node[] = tsxFileSections.filter(
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
