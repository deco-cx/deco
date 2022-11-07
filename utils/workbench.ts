import { basename } from "std/path/mod.ts";

import { context } from "../server.ts";
import { resolveFilePath } from "./filesystem.ts";

export interface Node {
  label: string;
  fullPath: string;
  editLink?: string;
  children?: Node[];
}

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
    label: 'sections',
    fullPath: './sections',
    children: firstLevel
  }]
};
