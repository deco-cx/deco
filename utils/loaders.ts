export const isLoaderProp = (value: unknown): value is string =>
  typeof value === "string" && value.charAt(0) === "{" &&
  value.charAt(value.length - 1) === "}";

export const loaderInstanceToProp = (loaderKey: string) => `{${loaderKey}}`;
export const propToLoaderInstance = (prop: string) =>
  prop.substring(1, prop.length - 1);

export const generateLoaderInstance = (loaderName: string) =>
  `${loaderName}-${crypto.randomUUID().slice(0, 4)}`;

// https://regex101.com/r/jjhKjb/2
export const loaderPathToKey = (loaderPath: string) =>
  loaderPath.replace(/\.\/loaders\/(.*)\.tsx?$/, "$1");
