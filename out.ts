
import * as sectionBlock from "$live/blocks/section.ts"
import * as pageBlock from "$live/blocks/page.ts"
import * as loaderBlock from "$live/blocks/loader.ts"
import * as accountBlock from "$live/blocks/account.ts"
import { Header as $section0 } from "./sections/Header.tsx"
import * as $page0 from "./sections/Page.tsx"
import { MyLoader as $loader0 } from "./sections/products.ts"
import * as $account0 from "./accounts/vtexAccount.ts"

const manifest = {
  blocks: {"section":{"./sections/Header.tsx@Header":{"inputSchema":"#/definitions/./sections/Header.tsx@Props","outputSchema":"#/definitions/$live/blocks/section.ts@Section"}},"page":{"./sections/Page.tsx":{"inputSchema":"#/definitions/./sections/Page.tsx@Props","outputSchema":"#/definitions/$live/blocks/page.ts@Page"}},"loader":{"./sections/products.ts@MyLoader":{"outputSchema":"#/definitions/./sections/products.ts@Product[]"}},"account":{"./accounts/vtexAccount.ts@VTEXAccount":{"type":"#/definitions/./accounts/vtexAccount.ts@VTEXAccount"}}},
  definitions: {"$live/blocks/section.ts@Section":{"type":"object"},"$live/blocks/page.ts@Page":{"type":"object"},"./sections/Header.tsx@Props":{"type":"object","properties":{"a":{"type":"number"},"products":{"$ref":"#/definitions/./sections/products.ts@Product[]"}},"required":["a","products"]},"./sections/products.ts@Product[]":{"type":"array","items":{"$ref":"#/definitions/./sections/products.ts@Product"}},"./sections/products.ts@Product":{"type":"object","properties":{"price":{"type":"number"}},"required":["price"]},"./sections/Page.tsx@Props":{"type":"object","properties":{"sections":{"type":"array","items":{"$ref":"#/definitions/$live/blocks/section.ts#Section"}}},"required":["sections"]},"./accounts/vtexAccount.ts@VTEXAccount":{"type":"object","properties":{"accountName":{"type":"string"}},"required":["accountName"]}},
  resolvers: {
    "./sections/Header.tsx@Header": sectionBlock.default.adapt($section0),
"./sections/Page.tsx": pageBlock.default.adapt($page0.default),
"./sections/products.ts@MyLoader": loaderBlock.default.adapt($loader0),
"./accounts/vtexAccount.ts@VTEXAccount": accountBlock.default.intercept($account0.default)
  }
}


