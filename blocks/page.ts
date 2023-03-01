import { Block } from "$live/engine/block.ts";
import { findExport } from "$live/engine/schema/utils.ts";
import { JSX } from "preact";
import { nodeToFunctionDefinition } from "../engine/schema/utils.ts";
import { ComponentFunc, PreactComponent } from "./types.ts";
import { tsTypeToSchemeable } from "../engine/schema/transform.ts";

export type PageInstance = JSX.Element;
export type Page<TProps = unknown> = ComponentFunc<TProps, PageInstance>;

const pageAddr = "$live/blocks/page.ts@Page";

const pageJSONSchema = {
  $ref: `#/definitions/${pageAddr}`,
};

const pageBlock: Block<Page, PreactComponent<PageInstance>> = {
  defaultPreview: (page) => page,
  type: "pages",
  baseSchema: [
    pageAddr,
    {
      type: "object",
      additionalProperties: true,
    },
  ],
  introspect: async (ctx, path, ast) => {
    if (!path.startsWith("./pages")) {
      return undefined;
    }
    const func = findExport("default", ast);
    if (!func) {
      return undefined;
    }
    const fn = nodeToFunctionDefinition(func);
    if (!fn) {
      throw new Error(
        `Default export of ${path} needs to be a const variable or a function`
      );
    }
    const inputTsType = fn.params.length > 0 ? fn.params[0] : undefined;
    return {
      functionRef: path,
      inputSchema: inputTsType
        ? await tsTypeToSchemeable(ctx, inputTsType, [path, ast])
        : undefined,
      outputSchema: {
        id: pageAddr,
        type: "inline",
        value: pageJSONSchema,
      },
    };
  },
  adapt:
    ({ default: Component }) =>
    (props) => ({
      Component,
      props,
    }),
};

export default pageBlock;
