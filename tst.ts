import accountBlock from "./blocks/account.ts";
import loaderBlock from "./blocks/loader.ts";
import pageBlock from "./blocks/page.ts";
import sectionBlock from "./blocks/section.ts";
import dev from "./dev.ts";

await dev(import.meta.url, "./main.ts", {
  blocks: [accountBlock, sectionBlock, pageBlock, loaderBlock],
});
