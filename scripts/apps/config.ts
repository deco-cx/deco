import * as colors from "std/fmt/colors.ts";
import { join, toFileUrl } from "std/path/mod.ts";

export interface AppConfig {
  name: string;
  dir: string;
}
export interface DecoConfig {
  apps?: AppConfig[];
}

export const getDecoConfig = async (dir: string) => {
  const decoConfig: DecoConfig = await import(
    toFileUrl(join(dir, "deco.ts")).toString()
  )
    .then((file) => file.default).catch(
      (_err) => {
        console.debug(
          `could not import deco.ts: ${colors.red(_err?.message ?? "")}`,
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
