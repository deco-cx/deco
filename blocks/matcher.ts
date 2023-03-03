import { InstanceOf } from "$live/blocks/types.ts";
import { newHandlerLikeBlock } from "$live/blocks/utils.ts";

export type MatcherResult = InstanceOf<typeof matcherBlock, "#/root/matchers">;

const matcherBlock = newHandlerLikeBlock<boolean, "matchers">("matchers");

export default matcherBlock;
