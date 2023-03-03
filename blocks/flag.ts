import { InstanceOf } from "$live/blocks/types.ts";
import { newHandlerLikeBlock } from "$live/blocks/utils.ts";
import { MatcherResult } from "$live/blocks/matcher.ts";

export type FlagResult = InstanceOf<typeof flagBlock, "#/root/flags">;

// TODO Inheritance flag is not working Author Marcos V. Candeia
export interface Flag<T = unknown> {
  isActive: MatcherResult;
  true?: T;
  false?: T;
}
const flagBlock = newHandlerLikeBlock("flags");

export default flagBlock;
