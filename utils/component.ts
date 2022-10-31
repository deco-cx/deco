import type { DecoManifest, Module } from "../types.ts";

/**
 * TODO: There's probably a file util for that
 */
// Valid expressions: https://regex101.com/r/7sPtnb/1
// /Component.tsx
// ./components/Foo.tsx
// /islands/Foo.tsx
// ./islands/Foo.tsx
// ./components/deep/Test.tsx
export const COMPONENT_NAME_REGEX =
  /^(\.?\/islands|\.?\/components|\.?\/loaders)?\/([\w\/]*)\.(tsx|jsx|js|ts)/;

export const BLOCKED_ISLANDS_SCHEMAS = new Set([
  "/Editor.tsx",
  "/InspectVSCode.tsx",
  "./islands/Editor.tsx",
  "./islands/InspectVSCode.tsx",
]);

export function filenameFromPath(path: string) {
  return path.replace(COMPONENT_NAME_REGEX, "$2");
}

export function isValidIsland(componentPath: string) {
  return !BLOCKED_ISLANDS_SCHEMAS.has(componentPath);
}

export function getComponentModule(
  manifest: DecoManifest,
  key: string
): Module | undefined {
  return manifest.islands?.[key] ?? manifest.components?.[key];
}
