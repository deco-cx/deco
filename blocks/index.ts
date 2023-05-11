import accountBlock from "$live/blocks/account.ts";
import actionBlock from "$live/blocks/action.ts";
import flagBlock from "$live/blocks/flag.ts";
import functionBlock from "$live/blocks/function.ts";
import handlerBlock from "$live/blocks/handler.ts";
import islandBlock from "$live/blocks/island.ts";
import loaderBlock from "$live/blocks/loader.ts";
import matcherBlock from "$live/blocks/matcher.ts";
import pageBlock from "$live/blocks/page.ts";
import routeBlock from "$live/blocks/route.ts";
import sectionBlock from "$live/blocks/section.ts";
import workflowBlock from "$live/blocks/workflow.ts";
import { Block } from "$live/engine/block.ts";

export default [
  functionBlock, // legacy
  accountBlock,
  loaderBlock,
  routeBlock,
  islandBlock,
  handlerBlock,
  pageBlock,
  sectionBlock,
  matcherBlock,
  flagBlock,
  actionBlock,
  workflowBlock,
] as Block[];
