import { join, toFileUrl } from "std/path/mod.ts";

export interface AppConfig {
  name: string;
  dir: string;
  deps?: string;
}
export interface DecoConfig {
  apps?: AppConfig[];
}

const decoTs = "deco.ts";
export const getDecoConfig = async (appLocation: string, appName?: string) => {
  const decoConfig: DecoConfig = await import(
    appLocation.startsWith("http")
      ? `${appLocation}/${decoTs}`
      : toFileUrl(join(appLocation, decoTs)).toString()
  )
    .then((file) => file.default).catch(
      (_err) => {
        return {
          apps: [{
            name: appName ?? Deno.args[0] ?? "unknown",
            dir: ".",
            deps: "./deps.ts",
          }],
        };
      },
    );
  return decoConfig;
};
