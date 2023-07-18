import { IslandModule as FreshIsland } from "$fresh/src/server/types.ts";
import section, { SectionModule } from "$live/blocks/section.ts";
import { Block, InstanceOf } from "$live/engine/block.ts";

export type Island = InstanceOf<Block, "#/root/islands">;

// deno-lint-ignore no-explicit-any
export type IslandModule<TConfig = any, TProps = any> =
  & SectionModule<TConfig, TProps>
  & Record<string, FreshIsland>;

const island: Block<IslandModule> = {
  ...section,
  type: "islands",
};

/**
 * islands are 1-1 to fresh islands.
 */
export default island;
