import * as colors from "@std/fmt/colors";
import { join } from "@std/path";
import { stringifyForWrite } from "../../utils/json.ts";
import { getDecoConfig } from "./config.ts";

const resolveAppLocation = async (appLocation: string) => {
  if (appLocation.startsWith("http")) {
    return appLocation;
  }
  const existsOnFS = await Deno.stat(appLocation).then((_r) => true).catch((
    _err,
  ) => false);
  if (existsOnFS) {
    return appLocation;
  }
  return `https://denopkg.com/${appLocation}`;
};
export const dev = async (
  appName: string,
  target: string,
  link: boolean,
  _appLocation: string,
) => {
  if (!target) {
    console.error(
      colors.red(
        `missing required parameters, try: deno task link $app $target`,
      ),
    );
    return;
  }
  const appLocation = await resolveAppLocation(_appLocation);
  const importMap = join(target, "deno.json");
  const exists = await Deno.stat(importMap).then((s) => !s.isDirectory).catch(
    (_err) => false,
  );
  if (!exists) {
    console.error(
      colors.red(
        `${importMap} is required for linking apps`,
      ),
    );
    return;
  }
  const config = await getDecoConfig(appLocation, appName);
  const apps = appName
    ? (config?.apps ?? []).filter((app) => app.name === appName)
    : (config?.apps ?? []);
  // update target import map

  const importMapContent: { imports: Record<string, string | undefined> } =
    await Deno
      .readTextFile(importMap).then((s) => JSON.parse(s));

  const changes: Promise<void>[] = [];
  const appsDirectory = join(target, "apps");
  if (apps.length > 0 && link) {
    await Deno.mkdir(appsDirectory).catch((_err) => {
      //ignore
    });
  }
  for (const app of apps) {
    changes.push((async () => {
      importMapContent.imports[`${app.name}/`] = link
        ? `${join(appLocation, app.dir)}/`.replace(Deno.cwd(), ".")
        : undefined;

      const appFile = join(
        appsDirectory,
        `${app.name.replaceAll("/", "_")}.ts`,
      );
      if (link) {
        await Deno.writeTextFile(
          appFile,
          `export { default } from "${app.name}/mod.ts";`,
          { create: true },
        );
      } else {
        await Deno.remove(appFile);
      }
    })());
  }

  await Promise.all(changes);
  await Deno.writeTextFile(
    importMap,
    stringifyForWrite(importMapContent),
  );
};
