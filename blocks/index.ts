import flagBlock from "$live/blocks/flag.ts";
import handlerBlock from "$live/blocks/handler.ts";
import islandBlock from "$live/blocks/island.ts";
import loaderBlock from "$live/blocks/loader.ts";
import matcherBlock from "$live/blocks/matcher.ts";
import pageBlock from "$live/blocks/page.ts";
import routeBlock from "$live/blocks/route.ts";
import sectionBlock from "$live/blocks/section.ts";

export default [
  loaderBlock, // TODO do not remove loader as first block as it is generating the return types correctly.
  // The problem here is related to schema generation. For each type that a loader return we add as a anyOf reference for the loader implementation on those types.
  // however, when a input prop depends on the same type, and it is added first than the loader, the type will override the loader type definition as the order matters.
  routeBlock,
  islandBlock,
  handlerBlock,
  pageBlock,
  sectionBlock,
  matcherBlock,
  flagBlock,
];
