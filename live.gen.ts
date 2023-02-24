import * as account from "./blocks/account.ts";
import * as $account0 from "./accounts/vtexAccount.ts";
import * as section from "./blocks/section.ts";
import { Header as $section0$Header } from "./components/Header.tsx";
import * as page from "./blocks/page.ts";
import * as $page0 from "./components/Page.tsx";
import * as loader from "./blocks/loader.ts";
import { MyLoader as $loader0$MyLoader } from "./components/products.ts";
import { configurable } from "$live/engine/adapters/fresh/manifest.ts";

const manifest = {
  "accounts": {
    "./accounts/vtexAccount.ts": account.default.adapt($account0.default),
  },
  "sections": {
    "./components/Header.tsx@Header": section.default.adapt($section0$Header),
  },
  "pages": {
    "./components/Page.tsx": page.default.adapt($page0.default),
  },
  "loaders": {
    "./components/products.ts@MyLoader": loader.default.adapt(
      $loader0$MyLoader,
    ),
  },
  "definitions": {
    "./accounts/vtexAccount.ts@VTEXAccount": {
      "type": "object",
      "properties": { "accountName": { "type": "string" } },
      "required": ["accountName"],
    },
    "./components/Header.tsx@Header": {
      "type": "object",
      "properties": {
        "input": { "$ref": "#/definitions/./components/Header.tsx@Props" },
        "output": { "$ref": "#/definitions/$live/blocks/section.ts@Section" },
      },
      "required": ["input", "output"],
    },
    "./components/Page.tsx": {
      "type": "object",
      "properties": {
        "input": { "$ref": "#/definitions/./components/Page.tsx@Props" },
        "output": { "$ref": "#/definitions/$live/blocks/page.ts@Page" },
      },
      "required": ["input", "output"],
    },
    "./components/products.ts@MyLoader": {
      "type": "object",
      "properties": {
        "input": {},
        "output": {
          "$ref": "#/definitions/./components/products.ts@Product[]",
        },
      },
      "required": ["input", "output"],
    },
    "./components/products.ts@Product[]": {
      "type": "array",
      "items": { "$ref": "#/definitions/./components/products.ts@Product" },
    },
    "./components/products.ts@Product": {
      "type": "object",
      "properties": { "price": { "type": "number" } },
      "required": ["price"],
    },
  },
};

export default configurable(manifest);
