import accountBlock from "../blocks/account.ts";
import actionBlock from "../blocks/action.ts";
import appBlock from "../blocks/app.ts";
import flagBlock from "../blocks/flag.ts";
import functionBlock from "../blocks/function.ts";
import handlerBlock from "../blocks/handler.ts";
import islandBlock from "../blocks/island.ts";
import loaderBlock from "../blocks/loader.ts";
import matcherBlock from "../blocks/matcher.ts";
import pageBlock from "./page.tsx";
import routeBlock from "../blocks/route.ts";
import sectionBlock from "../blocks/section.ts";
import workflowBlock from "../blocks/workflow.ts";
import { Block } from "../engine/block.ts";

const userDefinedBlocks: Block[] = [];

export function defineBlock(block: Block) {
  userDefinedBlocks.push(block);
}

// Keep this as a function to avoid const initialization cycle due to appblock dependency on this module
export default () =>
  [
    ...userDefinedBlocks,
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
    appBlock,
  ] as Block[];
