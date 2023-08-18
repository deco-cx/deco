import { basename } from "std/path/mod.ts";
import { context } from "../../live.ts";
import { toManifestBlocks } from "../../routes/live/_meta.ts";
import { resolveFilePath } from "../../utils/filesystem.ts";
import { allowCorsFor } from "../../utils/http.ts";

export interface Node {
  label: string;
  fullPath: string;
  editLink?: string;
  children?: Node[];
}

const capitalize = (str: string) => str[0].toUpperCase() + str.substring(1);
const createDataPageFor = (component: string) =>
  btoa(JSON.stringify({
    "name": component,
    "state": "global",
    "path": `/_live/workbench/sections/${component}`,
    "data": {
      "sections": [{
        "key": component,
        "label": component,
        "uniqueId": component,
        "props": {},
      }],
      "functions": [],
    },
  }));
const mapSectionToNode =
  (stateIndexed: Record<string, string>) => (component: string) => {
    let href: string | undefined = undefined;
    if (component.endsWith("global.tsx")) { // global settings
      const pageKey = stateIndexed[component];

      href = pageKey
        ? `/admin/${context.siteId}/pages/${pageKey}`
        : `/api/${context.siteId}/pages/new?redirect=true&data=${
          createDataPageFor(component)
        }`;
    } else {
      href = `/admin/sites/${context.siteId}/blocks/previews?ref=${
        encodeURIComponent("#/definitions/" + btoa(component))
      }`;
    }
    return {
      label: capitalize(basename(component)),
      fullPath: component,
      href,
      editLink: context.deploymentId === undefined // only allow vscode when developing locally
        ? `vscode://file/${resolveFilePath(component)}`
        : undefined,
    };
  };
const isTSXFile = (section: string) => section.endsWith(".tsx");

export const isGlobalSection = (section: string) =>
  section.endsWith(".global.tsx");

export const getWorkbenchTree = (state: Record<string, string>): Node[] => {
  const { blocks: { sections: _ignore, ...rest } } = toManifestBlocks(
    context.manifest!,
  );

  const nodes: Node[] = [];

  for (const [block, blockValues] of Object.entries(rest)) {
    nodes.push({
      label: capitalize(basename(block)),
      fullPath: block,
      children: Object.keys(blockValues).map(mapSectionToNode(state)),
    });
  }
  const sections = context.manifest?.sections ?? {};

  const tsxFileSections = Object
    .keys(sections)
    .filter((section) => isTSXFile(section));

  const firstLevelNonGlobalSectionNodes: Node[] = tsxFileSections.filter((
    section,
  ) => !isGlobalSection(section)).map(mapSectionToNode(state));

  const firstLevelGlobalSectionNodes: Node[] = tsxFileSections.filter(
    isGlobalSection,
  ).map(mapSectionToNode(state));

  return [{
    label: "sections",
    fullPath: "./sections",
    children: firstLevelNonGlobalSectionNodes,
  }, {
    label: "globals",
    fullPath: "./sections",
    children: firstLevelGlobalSectionNodes,
  }, ...nodes];
};

export const handler = async (req: Request) => {
  const state = await context.release!.state();
  const stateIndexed: Record<string, string> = {};

  for (const [key, value] of Object.entries(state)) {
    try {
      if ((value as { name: string })?.name?.endsWith("global.tsx")) {
        stateIndexed[value.name] = key;
      }
    } catch {
      // console.error({ key, value });
    }
  }

  return new Response(JSON.stringify(getWorkbenchTree(stateIndexed)), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...allowCorsFor(req),
    },
  });
};
