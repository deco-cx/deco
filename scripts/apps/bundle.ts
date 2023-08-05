import { decoManifestBuilder } from "$live/engine/fresh/manifestGen.ts";
import { genSchemas } from "$live/engine/schema/reader.ts";
import * as colors from "std/fmt/colors.ts";
import { join, toFileUrl } from "std/path/mod.ts";
import { format } from "../../utils/formatter.ts";
import { AppConfig, getDecoConfig } from "./config.ts";

const appModTemplate = (manifest: string) => `
${manifest}

export default function App(
  state: State,
): App<Manifest, State> {
  return {
    manifest,
    state,
  };
}

export type AppContext = AC<ReturnType<typeof App>>;
`;

const bundleApp = (dir: string) => async (app: AppConfig) => {
  console.log(`generating manfiest for ${colors.bgBrightGreen(app.name)}...`);
  const appDir = join(dir, app.dir);
  const manifest = (await decoManifestBuilder(appDir, app.name, true))
    .addImports({
      from: "./state.ts",
      clauses: [{ import: "State" }],
    }, {
      from: app.deps ?? "../deps.ts",
      clauses: [{ import: "App, AppContext as AC" }],
    }).addExports({
      name: "name",
      js: {
        kind: "js",
        raw: app.name,
      },
    }, {
      type: "State",
    });

  await Deno.writeTextFile(
    join(appDir, "mod.ts"),
    await format(appModTemplate(manifest.build())),
  );
  console.log(
    colors.brightBlue(`the manifest of ${app.name} has been generated`),
  );

  // temporary manifest
  const manifestFile = join(appDir, "manifest.temp.ts");
  await Deno.writeTextFile(
    manifestFile,
    manifest.addExportDefault({
      variable: { identifier: "manifest" },
    }).build(),
  );
  const manifestContent =
    (await import(toFileUrl(manifestFile).toString())).default;
  await genSchemas(manifestContent, app.dir);
  Deno.remove(manifestFile).catch((_err) => {
    //ignore
  });
};
const bundleApps = async () => {
  const dir = Deno.cwd();
  console.log(colors.brightGreen(`start bundling apps... ${dir}`));
  const decoConfig = await getDecoConfig(dir);

  console.debug(
    `found ${
      colors.brightBlue((decoConfig?.apps ?? []).length.toString())
    } apps`,
  );

  await Promise.all((decoConfig?.apps ?? []).map(bundleApp(dir)));
};

await bundleApps();
