import { newFsFolderProvider } from "@deco/deco/engine";
import { exists } from "@std/fs/exists";
import { join } from "@std/path";
import { build as tailwindBuild } from "./tailwind.ts";

const DECO_FOLDER = ".deco";
export const build = async (): Promise<void> => {
  await tailwindBuild();
  const decoFolder = join(Deno.cwd(), DECO_FOLDER);
  if (
    Deno.args.includes("build") && await exists(decoFolder)
  ) {
    const provider = newFsFolderProvider(join(DECO_FOLDER, "blocks"));
    const decofile = await provider.state();
    await Deno.writeTextFile(
      join(decoFolder, "decofile.json"),
      JSON.stringify(decofile, null, 2),
    );
  }
};
