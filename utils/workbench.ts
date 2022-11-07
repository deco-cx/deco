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
  const components = context.manifest?.components ?? {};

  const firstLevel = Object
    .keys(components)
    .filter((component) =>
      component.split("/").length === 3 && component.endsWith(".tsx")
    )
    .map((component) => ({
      label: basename(component),
      fullPath: component,
      editLink: context.deploymentId === undefined // only allow vscode when developing locally
        ? `vscode://file/${resolveFilePath(component)}`
        : undefined,
    }));

  return [{
    label: 'components',
    fullPath: './components',
    children: firstLevel
  }]
};
