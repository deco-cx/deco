import { join, toFileUrl } from "@std/path";

export interface AppConfig {
  name: string;
  dir: string;
}
export interface DecoConfig {
  apps?: AppConfig[];
}

const DECO_TS_FILE_NAME = "deco.ts";
const DENO_JSON_FILE_NAME = "deno.json";

const workspaceConfig = async (appLocation: string) => {
  const denoJSONPath = join(appLocation, DENO_JSON_FILE_NAME);
  const denoJSON: { workspace?: string[] } | null = await Deno.readTextFile(
    denoJSONPath,
  ).then(JSON.parse).catch(() => null);
  if (denoJSON?.workspace) {
    const appsDenoJSON: Array<{ name: string; dir: string } | null> =
      await Promise.all(
        denoJSON.workspace.map((dir) =>
          Deno.readTextFile(join(appLocation, dir, DENO_JSON_FILE_NAME))
            .then((denoJSONStr) => JSON.parse(denoJSONStr) as { name: string })
            .then(
              (denoJSON) => ({
                name: denoJSON?.name?.replace("@deco/", ""),
                dir,
              }),
            ).catch(() => null)
        ),
      );
    const validApps = appsDenoJSON.filter(Boolean);
    return {
      apps: validApps,
    } as DecoConfig;
  }
};
export const getDecoConfig = async (
  appLocation: string,
  appName?: string,
): Promise<DecoConfig> => {
  const wrkspaceConfig = await workspaceConfig(appLocation);
  const decoConfig: DecoConfig = await import(
    appLocation.startsWith("http")
      ? `${appLocation}/${DECO_TS_FILE_NAME}`
      : toFileUrl(join(appLocation, DECO_TS_FILE_NAME)).toString()
  )
    .then((file) => file.default).catch(
      (_err) => {
        return {
          apps: [{
            name: appName ?? Deno.args[0] ?? "unknown",
            dir: ".",
          }],
        };
      },
    );
  return {
    apps: [
      ...wrkspaceConfig?.apps ?? [],
      ...decoConfig.apps ?? [],
    ],
  };
};
