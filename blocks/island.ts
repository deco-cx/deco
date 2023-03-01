import { Block } from "$live/engine/block.ts";
import { findExport } from "$live/engine/schema/utils.ts";
import { JSX } from "preact";
import { nodeToFunctionDefinition } from "../engine/schema/utils.ts";
import { ComponentFunc, PreactComponent } from "./types.ts";
import { tsTypeToSchemeable } from "../engine/schema/transform.ts";

export type IslandInstance = JSX.Element;
export type Island<TProps = unknown> = ComponentFunc<TProps, IslandInstance>;

const islandAddr = "$live/blocks/island.ts@Island";

const islandJSONSchema = {
  $ref: `#/definitions/${islandAddr}`,
};

const islandBlock: Block<Island, PreactComponent<IslandInstance>> = {
  defaultPreview: (island) => island,
  type: "islands",
  baseSchema: [
    islandAddr,
    {
      type: "object",
      additionalProperties: true,
    },
  ],
  introspect: async (ctx, path, ast) => {
    if (!path.startsWith("./islands")) {
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
        id: islandAddr,
        type: "inline",
        value: islandJSONSchema,
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

export default islandBlock;
