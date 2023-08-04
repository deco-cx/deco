import { stringifyForWrite } from "$live/utils/json.ts";
import * as colors from "std/fmt/colors.ts";
import { join } from "std/path/mod.ts";
import { getDecoConfig } from "./config.ts";

const linkApp = async (appName: string, target: string) => {
  if (!appName || !target) {
    console.error(
      colors.red(
        `missing required parameters, try: deno task link $app $target`,
      ),
    );
    return;
  }
  const importMap = join(target, "import_map.json");
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
  const dir = Deno.cwd();
  const config = await getDecoConfig(dir);
  const app = (config?.apps ?? []).find((app) => app.name === appName);
  if (!app) {
    console.error(
      colors.red(
        `${appName} not found`,
      ),
    );
    return;
  }
  // update target import map

  const importMapContent: { imports: Record<string, string> } = await Deno
    .readTextFile(importMap).then((s) => JSON.parse(s));

  importMapContent.imports[`${appName}/`] = `${join(dir, app.dir)}/`;

  await Deno.writeTextFile(
    importMap,
    stringifyForWrite(importMapContent),
  );
  // import/export on apps folder
};

await linkApp(Deno.args[0], Deno.args[0]);
