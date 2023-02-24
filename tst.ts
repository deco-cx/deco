import { Block, buildingBlocks, ModuleAST } from "$live/engine/block.ts";
import { denoDoc } from "$live/engine/schema/transform.ts";
import { dirname } from "https://deno.land/std@0.170.0/path/win32.ts";
import { walk } from "std/fs/walk.ts";
import { globToRegExp } from "std/path/glob.ts";
import accountBlock from "./blocks/account.ts";
import loaderBlock from "./blocks/loader.ts";
import pageBlock from "./blocks/page.ts";
import sectionBlock from "./blocks/section.ts";
import { format } from "./dev.ts";
import { ManifestBuilder } from "./engine/adapters/fresh/manifestBuilder.ts";

export const decoManifestBuilder = async (
  blocks: Block[]
): Promise<ManifestBuilder> => {
  const liveIgnore = "./.liveignore";
  const st = await Deno.stat(liveIgnore);

  const ignoreGlobs = !st.isFile
    ? []
    : await Deno.readTextFile(liveIgnore).then((txt) => txt.split("\n"));

  const dir = dirname(import.meta.url);
  const modulePromises: Promise<ModuleAST>[] = [];
  for await (const entry of walk(".", {
    includeDirs: false,
    includeFiles: true,
    exts: ["tsx", "jsx", "ts", "js"],
    skip: ignoreGlobs.map((glob) => globToRegExp(glob, { globstar: true })),
  })) {
    modulePromises.push(
      denoDoc(entry.path).then((doc) => [dir, entry.path, doc])
    );
  }

  const modules = await Promise.all(modulePromises);
  const transformContext = modules.reduce(
    (ctx, module) => {
      return {
        ...ctx,
        code: {
          ...ctx.code,
          [`${ctx.base}/${module[1]}`]: [
            module[0],
            `./${module[1]}`,
            module[2],
          ],
        },
      };
    },
    { base: dir, code: {} }
  );

  return buildingBlocks(blocks, transformContext);
};

if (import.meta.main) {
  const blks = [accountBlock, sectionBlock, pageBlock, loaderBlock];
  const manifestData = await decoManifestBuilder(blks);
  await Deno.writeTextFile("./live.gen.ts", await format(manifestData.build()));
}
