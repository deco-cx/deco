import * as colors from "std/fmt/colors.ts";
import { join, toFileUrl } from "std/path/mod.ts";

export interface AppConfig {
  name: string;
  dir: string;
}
export interface DecoConfig {
  apps?: AppConfig[];
}

const decoTs = "deco.ts";
export const getDecoConfig = async (appLocation: string) => {
  const decoConfig: DecoConfig = await import(
    appLocation.startsWith("http")
      ? `${appLocation}/${decoTs}`
      : toFileUrl(join(appLocation, decoTs)).toString()
  )
    .then((file) => file.default).catch(
      (_err) => {
        console.debug(
          `could not import ${decoTs}: ${colors.red(_err?.message ?? "")}`,
        );
        return {
          apps: [{
            name: Deno.args[0] ?? "unknown",
            dir: ".",
          }],
        };
      },
    );
  return decoConfig;
};
