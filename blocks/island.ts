import { ConfigurableBlock } from "$live/engine/block.ts";
import { DecoManifest } from "$live/types.ts";

const blockType = "islands";
const islandBlock: ConfigurableBlock<DecoManifest["islands"]["string"]> = {
  import: "$live/blocks/island.ts",
  type: blockType,
  adapt: (blk) => blk,
  findModuleDefinitions: (_, [path]) => {
    if (!path.startsWith("./islands/")) {
      return Promise.resolve({ imports: [], schemeables: [] });
    }
    return Promise.resolve({
      imports: [`${path}@$`], // adding $ on the end of the path to mark as default exported
      schemeables: [],
    });
  },
};

export default islandBlock;
