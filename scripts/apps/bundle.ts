import { format } from "$live/dev.ts";
import { decoManifestBuilder } from "$live/engine/fresh/manifestGen.ts";
import { genSchemas } from "$live/engine/schema/reader.ts";
import { join } from "std/path/mod.ts";

const appModTemplate = (manifest: string, name: string) => `
import { State } from "./state.ts";
export type { State };
import { App, AppContext as AC } from "$live/blocks/app.ts";
${manifest}

export const name = "${name}";

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

interface AppConfig {
  name: string;
  dir: string;
}
interface DecoConfig {
  apps?: AppConfig[];
}
const bundleApp = async () => {
  const dir = Deno.cwd();
  const decoConfig: DecoConfig = await import(join(dir, "deco.ts"))
    .then((file) => file.default).catch(
      (_err) => ({
        apps: [{
          name: Deno.args[0] ?? "unknown",
          dir: ".",
        }],
      }),
    );

  for (const app of (decoConfig?.apps ?? [])) {
    const appDir = join(dir, app.dir);
    const manifest = await decoManifestBuilder(appDir, app.name, true);
    await Deno.writeTextFile(
      join(appDir, "deco.app.ts"),
      await format(appModTemplate(manifest.build(), app.name)),
    );

    // temporary manifest
    const manifestFile = join(appDir, "manifest.temp.ts");
    await Deno.writeTextFile(
      manifestFile,
      manifest.addExportDefault({
        variable: { identifier: "manifest" },
      }).build(),
    );
    const manifestContent = (await import(manifestFile)).default;
    await genSchemas(manifestContent, app.dir);
    Deno.remove(manifestFile).catch((_err) => {
      //ignore
    });
  }
};

await bundleApp();
