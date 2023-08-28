import * as colors from "std/fmt/colors.ts";
import { join } from "std/path/mod.ts";
import { decoManifestBuilder } from "../../engine/manifest/manifestGen.ts";
import { format } from "../../utils/formatter.ts";
import { AppConfig, getDecoConfig } from "./config.ts";

const bundleApp = (dir: string) => async (app: AppConfig) => {
  console.log(`generating manfiest for ${colors.bgBrightGreen(app.name)}...`);
  const appDir = join(dir, app.dir);
  const manifest = await decoManifestBuilder(appDir, app.name, {
    appMode: true,
  });

  const manifestFile = join(appDir, "manifest.gen.ts");
  await Deno.writeTextFile(
    manifestFile,
    await format(manifest.build()),
  );
  console.log(
    colors.brightBlue(`the manifest of ${app.name} has been generated`),
  );
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
