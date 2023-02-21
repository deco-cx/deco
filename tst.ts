import { walk } from "std/fs/walk.ts";
import { globToRegExp } from "std/path/glob.ts";
import { buildingBlocks, isFunctionBlock, ModuleAST } from "$live/block.ts";
import loaderBlock from "$live/blocks/loader.ts";
import pageBlock from "$live/blocks/page.ts";
import sectionBlock from "$live/blocks/section.ts";
import { denoDoc } from "$live/engine/schema/transform.ts";
import accountBlock from "$live/blocks/account.ts";
import { dirname } from "https://deno.land/std@0.170.0/path/win32.ts";

const dir = dirname(import.meta.url);
const modulePromises: Promise<ModuleAST>[] = [];
for await (const entry of walk(".", {
  match: [globToRegExp("**/*.tsx"), globToRegExp("**/*.ts")],
})) {
  modulePromises.push(
    denoDoc(entry.path).then((doc) => [dir, `./${entry.path}`, doc])
  );
}

const blocks = [sectionBlock, pageBlock, loaderBlock, accountBlock];
const modules = await Promise.all(modulePromises);

const manifestData = await buildingBlocks(blocks, modules);
const resolvers: [string, string][] = [];
const r = `
${blocks
  .map(
    (block) =>
      `import * as ${block.type}Block from "$live/blocks/${block.type}.ts"`
  )
  .join("\n")}
${blocks
  .map((block) => {
    const imports = Object.keys(manifestData.blocks[block.type]);
    const isFuncblock = isFunctionBlock(block);
    const strImports = imports
      .map((importStr, i) => {
        const [from, name] = importStr.split("@");
        const alias = `$${block.type}${i}`;
        const importAsDefault = `* as ${alias}`;
        const importClause = !isFuncblock
          ? importAsDefault
          : name !== undefined && name !== ""
          ? `{ ${name} as ${alias} }`
          : importAsDefault;

        const resolverAdapt = isFuncblock
          ? `${block.type}Block.default.adapt(${
              name === "" || name === undefined ? alias + ".default" : alias
            })`
          : `${block.type}Block.default.intercept(${alias + ".default"})`;
        resolvers.push([importStr, resolverAdapt]);
        return `import ${importClause} from "${from}"`;
      })
      .join("\n");
    return strImports;
  })
  .flat()
  .join("\n")}

const manifest = {
  blocks: ${JSON.stringify(manifestData.blocks)},
  definitions: ${JSON.stringify(manifestData.definitions)},
  resolvers: {
    ${resolvers.map(([k, v]) => `"${k}": ${v}`).join(",\n")}
  }
}

`;
console.log(r);
