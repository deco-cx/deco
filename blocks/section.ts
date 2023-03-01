import { Block } from "$live/engine/block.ts";
import { findExport } from "$live/engine/schema/utils.ts";
import { JSX } from "preact";
import { nodeToFunctionDefinition } from "../engine/schema/utils.ts";
import { ComponentFunc, PreactComponent } from "./types.ts";
import { tsTypeToSchemeable } from "../engine/schema/transform.ts";

export type SectionInstance = JSX.Element;
export type Section<TProps = unknown> = ComponentFunc<TProps, SectionInstance>;

const sectionAddr = "$live/blocks/section.ts@Section";

const sectionJSONSchema = {
  $ref: `#/definitions/${sectionAddr}`,
};

const sectionBlock: Block<Section, PreactComponent<SectionInstance>> = {
  defaultPreview: (section) => section,
  type: "sections",
  baseSchema: [
    sectionAddr,
    {
      type: "object",
      additionalProperties: true,
    },
  ],
  introspect: async (ctx, path, ast) => {
    if (!path.startsWith("./sections")) {
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
        id: sectionAddr,
        type: "inline",
        value: sectionJSONSchema,
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

export default sectionBlock;
