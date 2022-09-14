import type { DecoManifest, Module } from "../types.ts";

// Valid expressions: https://regex101.com/r/7sPtnb/1
// /Component.tsx
// ./components/Foo.tsx
// /islands/Foo.tsx
// ./islands/Foo.tsx
// ./components/deep/Test.tsx
export const COMPONENT_NAME_REGEX =
  /^(\.?\/islands|\.?\/components)?\/([\w\/]*)\.(tsx|jsx|js|ts)/;

export const BLOCKED_ISLANDS_SCHEMAS = new Set([
  "/Editor.tsx",
  "/InspectVSCode.tsx",
  "./islands/Editor.tsx",
  "./islands/InspectVSCode.tsx",
]);

export function componentNameFromPath(componentPath: string) {
  return componentPath.replace(COMPONENT_NAME_REGEX, "$2");
}

export function isValidIsland(componentPath: string) {
  return !BLOCKED_ISLANDS_SCHEMAS.has(componentPath);
}

export function getComponentModule(
  manifest: DecoManifest,
  filename: string,
): Module | undefined {
  return manifest.islands?.[`./islands/${filename}.tsx`] ??
    manifest.components?.[`./components/${filename}.tsx`];
}
