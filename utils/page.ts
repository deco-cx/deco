/**
 * TODO: There's probably a file util for that
 */
// Valid expressions: https://regex101.com/r/7sPtnb/1
// /Component.tsx
// ./components/Foo.tsx
// /islands/Foo.tsx
// ./islands/Foo.tsx
// ./components/deep/Test.tsx
export const PAGE_ENTITY_NAME_REGEX =
  /^(\.?\/islands|\.?\/sections|\.?\/matchers|\.?\/functions)?\/([\w\/]*)\.(tsx|jsx|js|ts)/;

export const BLOCKED_ISLANDS_SCHEMAS = new Set([
  "/Editor.tsx",
  "/InspectVSCode.tsx",
  "./islands/Editor.tsx",
  "./islands/InspectVSCode.tsx",
]);

export function filenameFromPath(path: string) {
  return path.replace(PAGE_ENTITY_NAME_REGEX, "$2");
}

export function isValidIsland(componentPath: string) {
  return !BLOCKED_ISLANDS_SCHEMAS.has(componentPath);
}

// TODO (mcandeia) where this should be used?
